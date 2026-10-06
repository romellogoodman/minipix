import { randFloat } from "../utils.js";

const WORK_MAX = 1024;
// Blur levels as fractions of the maximum sigma; level 0 is the sharp source.
const LEVELS = [0.25, 0.5, 1];

// In-place box pass: rows into `tmp`, then columns back into `buf`.
function boxPass(buf, tmp, w, h, r) {
  if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  const maxX = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += buf[row + (k < 0 ? 0 : k > maxX ? maxX : k)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * inv;
      const add = x + r + 1;
      const sub = x - r;
      sum += buf[row + (add > maxX ? maxX : add)] - buf[row + (sub < 0 ? 0 : sub)];
    }
  }
  const maxY = h - 1;
  const acc = new Float64Array(w);
  for (let k = -r; k <= r; k++) {
    const row = (k < 0 ? 0 : k > maxY ? maxY : k) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const out = y * w;
    const add = (y + r + 1 > maxY ? maxY : y + r + 1) * w;
    const sub = (y - r < 0 ? 0 : y - r) * w;
    for (let x = 0; x < w; x++) {
      buf[out + x] = acc[x] * inv;
      acc[x] += tmp[add + x] - tmp[sub + x];
    }
  }
}

/**
 * Tilt-shift miniature (after TiltShift + ProgressiveBlur): a focus band at
 * a random angle and offset stays pixel-sharp, and the blur ramps up with
 * distance from it — on both sides, or on one side only for a progressive
 * blur. Blurred levels are built on a downsampled buffer and blended per
 * pixel by the smoothstep ramp, then saturation gets a toy-like lift.
 */
export default function tiltShift({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const vertical = random() < config.verticalProbability;
  const angle = ((randFloat(config.angleDegrees, random) + (vertical ? 90 : 0)) * Math.PI) / 180;
  const offset = randFloat(config.center, random);
  const halfWidth = shortSide * randFloat(config.focusWidthPercent, random) * 0.5;
  const falloff = shortSide * randFloat(config.falloffPercent, random);
  const sigma = shortSide * randFloat(config.blurPercent, random);
  const saturation = randFloat(config.saturation, random);
  const progressive = random() < config.progressiveProbability;
  const flip = random() < 0.5;

  // Focus line through a point placed along the line's normal; the normal
  // spans the image's extent in that direction so offset 0..1 covers it.
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const extent = Math.abs(nx) * width + Math.abs(ny) * height;
  const lineD = (width / 2) * nx + (height / 2) * ny + (offset - 0.5) * extent;

  // Downsampled RGB planes.
  const block = Math.max(1, Math.ceil(Math.max(width, height) / WORK_MAX));
  const ww = Math.ceil(width / block);
  const wh = Math.ceil(height / block);
  const wn = ww * wh;
  const base = [new Float32Array(wn), new Float32Array(wn), new Float32Array(wn)];
  const counts = new Float32Array(wn);
  for (let y = 0; y < height; y++) {
    const wy = ((y / block) | 0) * ww;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const wi = wy + ((x / block) | 0);
      base[0][wi] += imageData[i];
      base[1][wi] += imageData[i + 1];
      base[2][wi] += imageData[i + 2];
      counts[wi]++;
    }
  }
  for (let i = 0; i < wn; i++) {
    const inv = 1 / counts[i];
    base[0][i] *= inv;
    base[1][i] *= inv;
    base[2][i] *= inv;
  }

  // Each level: three box passes approximating a Gaussian of that sigma.
  const tmp = new Float32Array(wn);
  const levels = LEVELS.map((f) => {
    const s = (sigma * f) / block;
    const r = Math.max(1, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2));
    return base.map((plane) => {
      const out = plane.slice();
      for (let pass = 0; pass < 3; pass++) boxPass(out, tmp, ww, wh, r);
      return out;
    });
  });

  const maxWX = ww - 1;
  const maxWY = wh - 1;
  const numLevels = LEVELS.length;
  const rgb = new Float32Array(3);
  for (let y = 0; y < height; y++) {
    let wy = (y + 0.5) / block - 0.5;
    wy = wy < 0 ? 0 : wy > maxWY ? maxWY : wy;
    const y0 = wy | 0;
    const y1 = y0 < maxWY ? y0 + 1 : y0;
    const fy = wy - y0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let dist = x * nx + y * ny - lineD;
      if (progressive) dist = flip ? -dist : dist;
      else dist = Math.abs(dist);
      // smoothstep(halfWidth, halfWidth + falloff, dist)
      let t = (dist - halfWidth) / falloff;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = t * t * (3 - 2 * t);

      rgb[0] = imageData[o];
      rgb[1] = imageData[o + 1];
      rgb[2] = imageData[o + 2];
      if (t > 0) {
        // Find the two levels bracketing t (level 0 = sharp source).
        let li = 0;
        while (li < numLevels - 1 && LEVELS[li] < t) li++;
        const hiF = LEVELS[li];
        const loF = li === 0 ? 0 : LEVELS[li - 1];
        const mix = (t - loF) / (hiF - loF);
        let wx = (x + 0.5) / block - 0.5;
        wx = wx < 0 ? 0 : wx > maxWX ? maxWX : wx;
        const x0 = wx | 0;
        const x1 = x0 < maxWX ? x0 + 1 : x0;
        const fx = wx - x0;
        const i00 = y0 * ww + x0, i10 = y0 * ww + x1, i01 = y1 * ww + x0, i11 = y1 * ww + x1;
        const hi = levels[li];
        const lo = li === 0 ? null : levels[li - 1];
        for (let c = 0; c < 3; c++) {
          const p = hi[c];
          const top = p[i00] + (p[i10] - p[i00]) * fx;
          const vHi = top + (p[i01] + (p[i11] - p[i01]) * fx - top) * fy;
          let vLo = rgb[c];
          if (lo) {
            const q = lo[c];
            const qt = q[i00] + (q[i10] - q[i00]) * fx;
            vLo = qt + (q[i01] + (q[i11] - q[i01]) * fx - qt) * fy;
          }
          rgb[c] = vLo + (vHi - vLo) * mix;
        }
      }

      const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
      outputData[o] = lum + (rgb[0] - lum) * saturation;
      outputData[o + 1] = lum + (rgb[1] - lum) * saturation;
      outputData[o + 2] = lum + (rgb[2] - lum) * saturation;
      outputData[o + 3] = 255;
    }
  }
}
