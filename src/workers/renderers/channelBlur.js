import { randFloat } from "../utils.js";

// In-place box pass: rows into `tmp`, then columns back into `buf` (running
// sums, clamped edges via per-pass index lookups). The column pass keeps a
// running row of sums so it stays row-major.
function boxPass(buf, tmp, w, h, r) {
  if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  const maxX = w - 1;
  const addX = new Int32Array(w);
  const subX = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    addX[x] = Math.min(x + r + 1, maxX);
    subX[x] = Math.max(x - r, 0);
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += buf[row + (k < 0 ? 0 : k > maxX ? maxX : k)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * inv;
      sum += buf[row + addX[x]] - buf[row + subX[x]];
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

// Box radius for three passes approximating a Gaussian of sigma.
const boxRadius = (sigma) => Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2);

// Wide blurs run on a buffer downsampled by an integer factor (block
// average) and are read back bilinearly; the blurred channel is smooth, so
// this only costs a fraction of a pixel of extra softness, which the reduced
// sigma compensates for.
// Three box radii (two neighbouring sizes) whose summed variance
// ((2r+1)² - 1) / 12 is closest to `variance`.
function boxRadiiForVariance(variance) {
  const boxVar = (r) => ((2 * r + 1) ** 2 - 1) / 12;
  let best = [0, 0, 0], bestErr = Infinity;
  const rMax = Math.ceil(Math.sqrt(Math.max(0, variance))) + 1;
  for (let r = 0; r <= rMax; r++) {
    for (let k = 0; k <= 3; k++) {
      const err = Math.abs((3 - k) * boxVar(r) + k * boxVar(r + 1) - variance);
      if (err < bestErr) {
        bestErr = err;
        best = [r + (k > 0 ? 1 : 0), r + (k > 1 ? 1 : 0), r + (k > 2 ? 1 : 0)];
      }
    }
  }
  return best;
}

const MIN_LOW_SIGMA = 2;
const MAX_FACTOR = 8;

/**
 * Independent blur per colour channel (after ChannelBlur): each of R, G and
 * B gets its own Gaussian radius (three box passes) and an optional nudge,
 * so edges split into soft coloured halos. One channel may stay razor sharp,
 * which keeps the image legible under the fringing.
 */
export default function channelBlur({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const radii = [0, 1, 2].map(() => shortSide * randFloat(config.radiusPercent, random));
  const keepSharp = random() < config.sharpChannelProbability;
  const sharpChannel = Math.floor(random() * 3);
  const useOffset = random() < config.offsetProbability;
  const offsets = [0, 1, 2].map(() => {
    const angle = random() * Math.PI * 2;
    const dist = shortSide * randFloat(config.offsetPercent, random);
    return [Math.round(Math.cos(angle) * dist), Math.round(Math.sin(angle) * dist)];
  });
  if (keepSharp) {
    radii[sharpChannel] = 0;
    offsets[sharpChannel] = [0, 0];
  }

  const n = width * height;
  const maxX = width - 1;
  const maxY = height - 1;
  const src32 =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, n)
      : new Uint32Array(imageData.slice().buffer, 0, n);

  // Per channel: the factor its blur runs at (1 = full resolution).
  const factors = radii.map((radius) => {
    const sigma = radius / 2;
    if (sigma < 3) return 1;
    return Math.min(MAX_FACTOR, 2 * Math.max(1, Math.floor(sigma / (2 * MIN_LOW_SIGMA))));
  });

  // 2x2 block sums of every channel in one packed pass; wider factors
  // (all even) sum these further.
  let half = null;
  const hw = Math.ceil(width / 2);
  const hh = Math.ceil(height / 2);
  if (factors.some((f) => f > 1)) {
    half = [new Uint32Array(hw * hh), new Uint32Array(hw * hh), new Uint32Array(hw * hh)];
    const [hr, hg, hb] = half;
    for (let y = 0; y < height; y++) {
      const hrow = (y >> 1) * hw;
      const row = y * width;
      for (let x = 0; x < width; x += 2) {
        const v0 = src32[row + x];
        // R and B summed in 16-bit lanes.
        let rb = v0 & 0xff00ff;
        let g = v0 & 0xff00;
        if (x < maxX) {
          const v1 = src32[row + x + 1];
          rb += v1 & 0xff00ff;
          g += v1 & 0xff00;
        }
        const hi = hrow + (x >> 1);
        hr[hi] += rb & 0xffff;
        hb[hi] += rb >>> 16;
        hg[hi] += g >>> 8;
      }
    }
  }

  // Blurred planes, each read back bilinearly at its own scale.
  const planes = [];
  for (let c = 0; c < 3; c++) {
    const sigma = radii[c] / 2;
    const f = factors[c];
    if (f === 1) {
      const plane = new Float32Array(n);
      const shift = c * 8;
      for (let i = 0; i < n; i++) plane[i] = (src32[i] >>> shift) & 0xff;
      const r = boxRadius(sigma);
      if (r >= 1) {
        const tmp = new Float32Array(n);
        for (let pass = 0; pass < 3; pass++) boxPass(plane, tmp, width, height, r);
      }
      planes.push({ plane, f, lw: width, lh: height });
      continue;
    }

    // Block-average down by f from the 2x2 sums.
    const k = f >> 1;
    const lw = Math.ceil(width / f);
    const lh = Math.ceil(height / f);
    const ln = lw * lh;
    const sums = new Float32Array(ln);
    const hs = half[c];
    for (let hy = 0; hy < hh; hy++) {
      const lrow = ((hy / k) | 0) * lw;
      for (let hx = 0, hi = hy * hw; hx < hw; hx += k) {
        const end = Math.min(k, hw - hx);
        let s = 0;
        for (let j = 0; j < end; j++, hi++) s += hs[hi];
        sums[lrow + ((hx / k) | 0)] += s;
      }
    }
    const plane = sums;
    for (let ly = 0, i = 0; ly < lh; ly++) {
      const bh = Math.min(f, height - ly * f);
      for (let lx = 0; lx < lw; lx++, i++) plane[i] /= bh * Math.min(f, width - lx * f);
    }
    // Match the full-resolution blur's variance: three boxes of radius r
    // there, minus the blur the block average and bilinear read-back add
    // (~1/12 + 1/6 low-res px²), split over three low-res boxes of mixed
    // radii so the coarser grid doesn't round it off.
    const rFull = boxRadius(sigma);
    const target = ((2 * rFull + 1) ** 2 - 1) / 4 / (f * f) - 0.25;
    const tmp = new Float32Array(ln);
    for (const r of boxRadiiForVariance(target)) boxPass(plane, tmp, lw, lh, r);
    planes.push({ plane, f, lw, lh });
  }

  // Per-channel column taps (offset applied, then scaled to the plane).
  const cols = planes.map(({ f, lw }, c) => {
    const ox = useOffset ? offsets[c][0] : 0;
    const x0s = new Int32Array(width);
    const x1s = new Int32Array(width);
    const fxs = new Float32Array(width);
    const maxLX = lw - 1;
    for (let x = 0; x < width; x++) {
      let sx = x - ox;
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      let u = (sx + 0.5) / f - 0.5;
      u = u < 0 ? 0 : u > maxLX ? maxLX : u;
      const x0 = u | 0;
      x0s[x] = x0;
      x1s[x] = x0 < maxLX ? x0 + 1 : x0;
      fxs[x] = u - x0;
    }
    return { x0s, x1s, fxs };
  });

  const outAligned = outputData.byteOffset % 4 === 0;
  const out32 = outAligned
    ? new Uint32Array(outputData.buffer, outputData.byteOffset, n)
    : new Uint32Array(n);
  // Each channel's row, interpolated vertically then horizontally.
  const rows = planes.map(({ lw }) => new Float32Array(lw));
  const chan = new Uint8ClampedArray(width * 3);
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      const { plane, f, lw, lh } = planes[c];
      const oy = useOffset ? offsets[c][1] : 0;
      let sy = y - oy;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      const maxLY = lh - 1;
      let v = (sy + 0.5) / f - 0.5;
      v = v < 0 ? 0 : v > maxLY ? maxLY : v;
      const y0 = v | 0;
      const fy = v - y0;
      const r0 = y0 * lw;
      const r1 = (y0 < maxLY ? y0 + 1 : y0) * lw;
      const row = rows[c];
      if (fy === 0) row.set(plane.subarray(r0, r0 + lw));
      else for (let i = 0; i < lw; i++) row[i] = plane[r0 + i] + (plane[r1 + i] - plane[r0 + i]) * fy;
      const { x0s, x1s, fxs } = cols[c];
      const base = c * width;
      for (let x = 0; x < width; x++) {
        const a = row[x0s[x]];
        chan[base + x] = a + (row[x1s[x]] - a) * fxs[x];
      }
    }
    for (let x = 0, pi = y * width; x < width; x++, pi++) {
      out32[pi] = chan[x] | (chan[width + x] << 8) | (chan[2 * width + x] << 16) | 0xff000000;
    }
  }
  if (!outAligned) outputData.set(new Uint8ClampedArray(out32.buffer));
}
