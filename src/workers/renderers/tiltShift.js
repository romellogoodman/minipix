import { randFloat } from "../utils.js";

const WORK_MAX = 1024;
// Blur levels as fractions of the maximum sigma; level 0 is the sharp source.
const LEVELS = [0.25, 0.5, 1];

// In-place box pass over interleaved RGB (3 floats per pixel): rows into
// `tmp`, then columns back into `buf` (running sums, clamped edges). The
// clamped indices come from per-pass lookups so the loops stay branch-free.
function boxPass3(buf, tmp, w, h, r) {
  if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  const maxX = w - 1;
  const addX = new Int32Array(w);
  const subX = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    addX[x] = Math.min(x + r + 1, maxX) * 3;
    subX[x] = Math.max(x - r, 0) * 3;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w * 3;
    let sr = 0, sg = 0, sb = 0;
    for (let k = -r; k <= r; k++) {
      const i = row + (k < 0 ? 0 : k > maxX ? maxX : k) * 3;
      sr += buf[i];
      sg += buf[i + 1];
      sb += buf[i + 2];
    }
    for (let x = 0, o = row; x < w; x++, o += 3) {
      tmp[o] = sr * inv;
      tmp[o + 1] = sg * inv;
      tmp[o + 2] = sb * inv;
      const ai = row + addX[x];
      const si = row + subX[x];
      sr += buf[ai] - buf[si];
      sg += buf[ai + 1] - buf[si + 1];
      sb += buf[ai + 2] - buf[si + 2];
    }
  }
  const maxY = h - 1;
  const w3 = w * 3;
  const acc = new Float64Array(w3);
  for (let k = -r; k <= r; k++) {
    const row = (k < 0 ? 0 : k > maxY ? maxY : k) * w3;
    for (let x = 0; x < w3; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const out = y * w3;
    const add = (y + r + 1 > maxY ? maxY : y + r + 1) * w3;
    const sub = (y - r < 0 ? 0 : y - r) * w3;
    for (let x = 0; x < w3; x++) {
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

  // Downsampled RGB planes: integer block sums via a column lookup.
  const block = Math.max(1, Math.ceil(Math.max(width, height) / WORK_MAX));
  const ww = Math.ceil(width / block);
  const wh = Math.ceil(height / block);
  const wn = ww * wh;
  const n = width * height;
  const src32 =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, n)
      : new Uint32Array(imageData.slice().buffer, 0, n);
  const sumR = new Uint32Array(wn);
  const sumG = new Uint32Array(wn);
  const sumB = new Uint32Array(wn);
  for (let y = 0; y < height; y++) {
    const wy = ((y / block) | 0) * ww;
    for (let x = 0, pi = y * width, wi = wy; x < width; x += block, wi++) {
      // R and B summed in 16-bit lanes of one word (block <= 256).
      let rb = 0, g = 0;
      for (let pe = pi + Math.min(block, width - x); pi < pe; pi++) {
        const v = src32[pi];
        rb += v & 0xff00ff;
        g += v & 0xff00;
      }
      sumR[wi] += rb & 0xffff;
      sumB[wi] += rb >>> 16;
      sumG[wi] += g >>> 8;
    }
  }
  const base = new Float32Array(wn * 3);
  for (let by = 0, i = 0; by < wh; by++) {
    const bh = Math.min(block, height - by * block);
    for (let bx = 0; bx < ww; bx++, i++) {
      const inv = 1 / (bh * Math.min(block, width - bx * block));
      base[i * 3] = sumR[i] * inv;
      base[i * 3 + 1] = sumG[i] * inv;
      base[i * 3 + 2] = sumB[i] * inv;
    }
  }

  // Each level: three box passes approximating a Gaussian of that sigma,
  // on interleaved RGB for the per-pixel lookups.
  const tmp = new Float32Array(wn * 3);
  const levels = LEVELS.map((f) => {
    const s = (sigma * f) / block;
    const r = Math.max(1, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2));
    const rgb = base.slice();
    for (let pass = 0; pass < 3; pass++) boxPass3(rgb, tmp, ww, wh, r);
    return rgb;
  });

  const maxWX = ww - 1;
  const maxWY = wh - 1;
  // Per-column bilinear taps into the work buffer (as RGB offsets).
  const colX0 = new Int32Array(width);
  const colX1 = new Int32Array(width);
  const colFX = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let wx = (x + 0.5) / block - 0.5;
    wx = wx < 0 ? 0 : wx > maxWX ? maxWX : wx;
    const x0 = wx | 0;
    colX0[x] = x0 * 3;
    colX1[x] = (x0 < maxWX ? x0 + 1 : x0) * 3;
    colFX[x] = wx - x0;
  }
  const L0 = LEVELS[0], L1 = LEVELS[1];
  const inv1 = 1 / (L1 - L0), inv2 = 1 / (LEVELS[2] - L1);
  const invFalloff = 1 / falloff;
  // Blur ramp t at a full-resolution position: smoothstep of the distance
  // past the focus band.
  const ramp = (px, py) => {
    let dist = px * nx + py * ny - lineD;
    if (progressive) dist = flip ? -dist : dist;
    else dist = dist < 0 ? -dist : dist;
    let t = (dist - halfWidth) * invFalloff;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };

  // The blurred levels and the ramp are both smooth, so blend the levels
  // once per work pixel (t evaluated at its centre) into one blurred
  // buffer. Below the first level the full-resolution pass fades from the
  // sharp source into it.
  const blur = new Float32Array(wn * 3);
  for (let wy = 0, i = 0; wy < wh; wy++) {
    const py = (wy + 0.5) * block - 0.5;
    for (let wx = 0; wx < ww; wx++, i += 3) {
      const t = ramp((wx + 0.5) * block - 0.5, py);
      let lo, hi, mix;
      if (t <= L0) {
        blur[i] = levels[0][i];
        blur[i + 1] = levels[0][i + 1];
        blur[i + 2] = levels[0][i + 2];
        continue;
      } else if (t <= L1) {
        lo = levels[0];
        hi = levels[1];
        mix = (t - L0) * inv1;
      } else {
        lo = levels[1];
        hi = levels[2];
        mix = (t - L1) * inv2;
      }
      blur[i] = lo[i] + (hi[i] - lo[i]) * mix;
      blur[i + 1] = lo[i + 1] + (hi[i + 1] - lo[i + 1]) * mix;
      blur[i + 2] = lo[i + 2] + (hi[i + 2] - lo[i + 2]) * mix;
    }
  }

  const outAligned = outputData.byteOffset % 4 === 0;
  const out32 = outAligned
    ? new Uint32Array(outputData.buffer, outputData.byteOffset, n)
    : new Uint32Array(n);
  const lumK = 1 - saturation;
  const blurRow = new Float32Array(ww * 3);
  const invL0 = 1 / L0;
  // Channel value after the saturation lift, rounded and clamped to a byte.
  const toByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0);
  for (let y = 0; y < height; y++) {
    let wy = (y + 0.5) / block - 0.5;
    wy = wy < 0 ? 0 : wy > maxWY ? maxWY : wy;
    const y0 = wy | 0;
    const fy = wy - y0;
    const r0 = y0 * ww * 3;
    const r1 = (y0 < maxWY ? y0 + 1 : y0) * ww * 3;
    const rowD = y * ny - lineD;
    for (let i = 0; i < ww * 3; i++) blurRow[i] = blur[r0 + i] + (blur[r1 + i] - blur[r0 + i]) * fy;
    for (let x = 0, pi = y * width; x < width; x++, pi++) {
      let dist = x * nx + rowD;
      if (progressive) dist = flip ? -dist : dist;
      else dist = dist < 0 ? -dist : dist;
      let t = (dist - halfWidth) * invFalloff;
      const v = src32[pi];
      let r = v & 0xff;
      let g = (v >>> 8) & 0xff;
      let b = (v >>> 16) & 0xff;
      if (t > 0) {
        t = t > 1 ? 1 : t;
        t = t * t * (3 - 2 * t);
        const x0 = colX0[x], x1 = colX1[x], fx = colFX[x];
        const br = blurRow[x0] + (blurRow[x1] - blurRow[x0]) * fx;
        const bg = blurRow[x0 + 1] + (blurRow[x1 + 1] - blurRow[x0 + 1]) * fx;
        const bb = blurRow[x0 + 2] + (blurRow[x1 + 2] - blurRow[x0 + 2]) * fx;
        if (t < L0) {
          const m = t * invL0;
          r += (br - r) * m;
          g += (bg - g) * m;
          b += (bb - b) * m;
        } else {
          r = br;
          g = bg;
          b = bb;
        }
      }

      const lum = (0.299 * r + 0.587 * g + 0.114 * b) * lumK;
      out32[pi] =
        (toByte(r * saturation + lum) |
          (toByte(g * saturation + lum) << 8) |
          (toByte(b * saturation + lum) << 16) |
          0xff000000) >>>
        0;
    }
  }
  if (!outAligned) outputData.set(new Uint8ClampedArray(out32.buffer));
}
