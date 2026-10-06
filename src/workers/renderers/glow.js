import { randFloat } from "../utils.js";

// exp(-d²) < 0.004 beyond d = sqrt(ln 250) ≈ 2.35 core radii.
const CORE_CUTOFF = 2.4;
// Blur radii (in low-res pixels) from which a bloom scale is computed at half
// the low-res grid: the result is too smooth for the extra step to show.
const HALF_RES_MIN_R = 8;

// Running-sum box blur of one channel, horizontal then vertical, in place.
// The vertical pass keeps one accumulator per column and walks rows, so all
// reads are sequential. colAcc is scratch of length w.
function boxBlur(src, tmp, colAcc, w, h, r) {
  if (r < 1) return;
  const norm = 1 / (2 * r + 1);
  const maxX = w - 1, maxY = h - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + (k < 0 ? 0 : k > maxX ? maxX : k)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      const ad = x + r + 1, sb = x - r;
      acc += src[row + (ad > maxX ? maxX : ad)] - src[row + (sb < 0 ? 0 : sb)];
    }
  }
  colAcc.fill(0);
  for (let k = -r; k <= r; k++) {
    const row = (k < 0 ? 0 : k > maxY ? maxY : k) * w;
    for (let x = 0; x < w; x++) colAcc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) src[row + x] = colAcc[x] * norm;
    const ad = y + r + 1, sb = y - r;
    const ra = (ad > maxY ? maxY : ad) * w, rs = (sb < 0 ? 0 : sb) * w;
    for (let x = 0; x < w; x++) colAcc[x] += tmp[ra + x] - tmp[rs + x];
  }
}

export default function glow({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const threshold = randFloat(config.threshold, random);
  const radius = minDim * randFloat(config.radiusPercent, random);
  const intensity = randFloat(config.intensity, random);
  // Optional colour cast on the bloom (warm sodium, cool blue, magenta...).
  const tinted = random() < config.tintProbability;
  const tintHue = random() * Math.PI * 2;
  const tintAmount = randFloat(config.tintAmount, random);
  const sparkle = random() < config.sparkleProbability;
  const spacing = minDim * randFloat(config.sparkleSpacingPercent, random);
  const sparkleThreshold = randFloat(config.sparkleThreshold, random);
  const sparkleDensity = randFloat(config.sparkleDensity, random); // share of grid cells that may glint
  const sparkleIntensity = randFloat(config.sparkleIntensity, random);
  const rayLength = randFloat(config.rayLength, random); // fraction of the cell's half-width
  const sixPoint = random() < config.sixPointProbability;
  const starAngle = random() < 0.5 ? 0 : random() * Math.PI;
  const colorize = randFloat(config.colorize, random);
  const sparkleSeed = random() * 1e4;

  // Bright-pass on a downsampled buffer (≤ ~640 px), the shader's bloom extract.
  const f = Math.max(1, Math.floor(minDim / 640));
  const w = Math.ceil(width / f), h = Math.ceil(height / f), n = w * h;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n);
  // Integer block sums, accumulated row by row (sequential reads).
  const src32 =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
      : new Uint32Array(imageData.slice().buffer);
  const sR = new Int32Array(w), sG = new Int32Array(w), sB = new Int32Array(w);
  for (let sy = 0; sy < h; sy++) {
    const y0 = sy * f, y1 = Math.min(height, y0 + f);
    sR.fill(0); sG.fill(0); sB.fill(0);
    for (let y = y0; y < y1; y++) {
      for (let sx = 0, x = 0, q = y * width; sx < w; sx++) {
        const x1 = Math.min(width, x + f);
        let r = 0, g = 0, b = 0;
        for (; x < x1; x++, q++) {
          const v = src32[q];
          r += v & 255; g += (v >>> 8) & 255; b += (v >>> 16) & 255;
        }
        sR[sx] += r; sG[sx] += g; sB[sx] += b;
      }
    }
    for (let sx = 0; sx < w; sx++) {
      const x0 = sx * f, x1 = Math.min(width, x0 + f);
      const k = 1 / (255 * (y1 - y0) * (x1 - x0));
      const p = sy * w + sx;
      R[p] = sR[sx] * k; G[p] = sG[sx] * k; B[p] = sB[sx] * k;
      L[p] = 0.2126 * R[p] + 0.7152 * G[p] + 0.0722 * B[p];
    }
  }

  const tr = 1 + tintAmount * Math.cos(tintHue);
  const tg = 1 + tintAmount * Math.cos(tintHue - 2.094);
  const tb = 1 + tintAmount * Math.cos(tintHue + 2.094);
  const eR = new Float32Array(n), eG = new Float32Array(n), eB = new Float32Array(n);
  const knee = 1 / Math.max(0.05, 1 - threshold);
  for (let p = 0; p < n; p++) {
    const t = Math.max(0, L[p] - threshold) * knee;
    const wgt = t < 0.2 ? t * t * 2.5 : t - 0.1; // soft knee
    eR[p] = R[p] * wgt * (tinted ? tr : 1);
    eG[p] = G[p] * wgt * (tinted ? tg : 1);
    eB[p] = B[p] * wgt * (tinted ? tb : 1);
  }

  // Multi-scale bloom: three Gaussian-ish blurs (3 box passes each) at
  // radius, radius/3 and radius/9, summed — a tight core with a wide halo.
  const gR = new Float32Array(n), gG = new Float32Array(n), gB = new Float32Array(n);
  const work = new Float32Array(n), tmp = new Float32Array(n), colAcc = new Float64Array(w);
  const scales = [[1, 0.5], [1 / 3, 0.3], [1 / 9, 0.2]];
  // Wide scales (r ≥ HALF_RES_MIN_R) run on a further 2x-downsampled grid.
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), n2 = w2 * h2;
  const half = new Float32Array(n2), tmp2 = new Float32Array(n2);
  for (const [chan, out] of [[eR, gR], [eG, gG], [eB, gB]]) {
    for (const [s, wgt] of scales) {
      const r = Math.max(1, Math.round((radius * s) / f / 1.7));
      if (r >= HALF_RES_MIN_R) {
        halve(chan, half, w, h, w2, h2);
        const r2 = Math.round(r / 2);
        boxBlur(half, tmp2, colAcc, w2, h2, r2);
        boxBlur(half, tmp2, colAcc, w2, h2, r2);
        boxBlur(half, tmp2, colAcc, w2, h2, r2);
        addDoubled(half, out, w2, h2, w, h, wgt);
        continue;
      }
      work.set(chan);
      boxBlur(work, tmp, colAcc, w, h, r);
      boxBlur(work, tmp, colAcc, w, h, r);
      boxBlur(work, tmp, colAcc, w, h, r);
      for (let p = 0; p < n; p++) out[p] += work[p] * wgt;
    }
  }

  // Bilinear upsample + screen blend, separably: each output row first
  // blends two low-res rows (already scaled and clamped), then lerps along x.
  screenUpsample(imageData, outputData, width, height, w, h, f, gR, gG, gB, intensity * 2);

  if (!sparkle) return;

  // Star glints (Sparkle): two jittered grids of points; each snaps to the
  // brightest pixel nearby and, if bright enough, draws a Gaussian core plus
  // 4 or 6 exponential rays, faded out by a Chebyshev window.
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + sparkleSeed) * 43758.5453;
    return s - Math.floor(s);
  };
  const axes = sixPoint ? 3 : 2;
  const axisCos = [], axisSin = [];
  for (let k = 0; k < axes; k++) {
    axisCos.push(Math.cos(starAngle + (k * Math.PI) / axes));
    axisSin.push(Math.sin(starAngle + (k * Math.PI) / axes));
  }
  const spans = new Float64Array(8), merged = new Float64Array(8);
  for (const [layer, gridScale] of [[0, 1], [1, 2 / 3]]) {
    const cellSize = spacing * gridScale;
    // Rays reach past the cell (unlike the shader) so they spill out of the
    // blown-out highlights they sit on.
    const reach = cellSize * 0.9;
    const L1 = reach * rayLength * 0.3; // ray e-folding length
    const W1 = Math.max(0.6, reach * 0.012); // ray half-width
    const core = Math.max(1, reach * 0.06);
    const cols = Math.ceil(width / cellSize), rows = Math.ceil(height / cellSize);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const jx = hash(gx + layer * 31, gy), jy = hash(gy + 17, gx + layer * 7), rz = hash(gx * 3 + layer, gy * 5 + 1);
        if (hash(gx * 7 + 3, gy * 11 + layer) > sparkleDensity) continue;
        let px = (gx + 0.5 + (jx - 0.5) * 0.6) * cellSize;
        let py = (gy + 0.5 + (jy - 0.5) * 0.6) * cellSize;
        // Brightest low-res pixel within a quarter cell.
        const sr = Math.max(1, Math.round(cellSize * 0.25 / f));
        const cx = Math.min(w - 1, (px / f) | 0), cy = Math.min(h - 1, (py / f) | 0);
        let best = -1, bp = 0;
        for (let y = Math.max(0, cy - sr); y <= Math.min(h - 1, cy + sr); y++) {
          for (let x = Math.max(0, cx - sr); x <= Math.min(w - 1, cx + sr); x++) {
            if (L[y * w + x] > best) { best = L[y * w + x]; bp = y * w + x; }
          }
        }
        const t = Math.min(1, Math.max(0, (Math.sqrt(best) - sparkleThreshold) / 0.12));
        const presence = t * t * (3 - 2 * t);
        if (presence <= 0) continue;
        px = ((bp % w) + 0.5) * f;
        py = (((bp / w) | 0) + 0.5) * f;
        const level = (rz < 0.45 ? 0.35 : 1) * presence * sparkleIntensity * 255;
        const lum = Math.max(0.001, L[bp]);
        const sR = level * (1 + colorize * (0.6 * R[bp] / lum - 1));
        const sG = level * (1 + colorize * (0.6 * G[bp] / lum - 1));
        const sB = level * (1 + colorize * (0.6 * B[bp] / lum - 1));
        const x0 = Math.max(0, Math.floor(px - reach)), x1 = Math.min(width - 1, Math.ceil(px + reach));
        const y0 = Math.max(0, Math.floor(py - reach)), y1 = Math.min(height - 1, Math.ceil(py + reach));
        // Only the core disc and the ray bands can reach v ≥ 0.004: collect
        // their x-spans per row and skip the rest of the window (identical
        // output, a fraction of the exp() calls).
        const coreR = core * CORE_CUTOFF;
        const band = W1 * 8;
        for (let y = y0; y <= y1; y++) {
          const dy = y - py;
          let ns = 0;
          if (Math.abs(dy) < coreR) {
            const half = Math.sqrt(coreR * coreR - dy * dy);
            spans[ns++] = px - half; spans[ns++] = px + half;
          }
          for (let k = 0; k < axes; k++) {
            // across = |dy·cos − dx·sin| < band
            const sn = axisSin[k], cs = axisCos[k];
            if (Math.abs(sn) < 1e-9) {
              if (Math.abs(dy * cs) < band) { spans[ns++] = x0; spans[ns++] = x1; }
            } else {
              const centre = px + (dy * cs) / sn, half = band / Math.abs(sn);
              spans[ns++] = centre - half; spans[ns++] = centre + half;
            }
          }
          if (ns === 0) continue;
          // Merge the (at most 4) spans into a sorted, clipped list.
          let m = 0;
          for (let q = 0; q < ns; q += 2) {
            const lo = Math.max(x0, Math.floor(spans[q]) - 1), hi = Math.min(x1, Math.ceil(spans[q + 1]) + 1);
            if (lo <= hi) { merged[m++] = lo; merged[m++] = hi; }
          }
          for (let q = 2; q < m; q += 2) {
            for (let z = q; z >= 2 && merged[z - 2] > merged[z]; z -= 2) {
              const t0 = merged[z], t1 = merged[z + 1];
              merged[z] = merged[z - 2]; merged[z + 1] = merged[z - 1];
              merged[z - 2] = t0; merged[z - 1] = t1;
            }
          }
          let prevEnd = x0 - 1;
          for (let q = 0; q < m; q += 2) {
            const xs = Math.max(merged[q], prevEnd + 1), xe = merged[q + 1];
            if (xe > prevEnd) prevEnd = xe;
          for (let x = xs; x <= xe; x++) {
            const dx = x - px;
            const cheb = Math.max(Math.abs(dx), Math.abs(dy)) / reach;
            if (cheb >= 1) continue;
            let v = Math.exp(-(dx * dx + dy * dy) / (core * core));
            for (let k = 0; k < axes; k++) {
              const along = Math.abs(dx * axisCos[k] + dy * axisSin[k]);
              const across = Math.abs(dy * axisCos[k] - dx * axisSin[k]);
              if (across < W1 * 8) v += 0.6 * Math.exp(-across / W1 - along / L1);
            }
            if (cheb > 0.6) { const s = (cheb - 0.6) / 0.4; v *= 1 - s * s * (3 - 2 * s); }
            if (v < 0.004) continue;
            const i = (y * width + x) * 4;
            outputData[i] += sR * v;
            outputData[i + 1] += sG * v;
            outputData[i + 2] += sB * v;
          }
          }
        }
      }
    }
  }
}

function screenUpsample(imageData, outputData, width, height, w, h, f, gR, gG, gB, gain) {
  const scale = 1 / f;
  const colI = new Int32Array(width), colT = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * scale - 0.5));
    const x0 = fx | 0;
    colI[x] = x0;
    colT[x] = fx - x0;
  }
  const rR = new Float32Array(w + 1), rG = new Float32Array(w + 1), rB = new Float32Array(w + 1);
  const src32 =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
      : new Uint32Array(imageData.slice().buffer);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * scale - 0.5));
    const y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    const a = y0 * w, c = y1 * w;
    for (let x = 0; x < w; x++) {
      const vr = (gR[a + x] + (gR[c + x] - gR[a + x]) * ty) * gain;
      const vg = (gG[a + x] + (gG[c + x] - gG[a + x]) * ty) * gain;
      const vb = (gB[a + x] + (gB[c + x] - gB[a + x]) * ty) * gain;
      rR[x] = vr < 1 ? vr : 1;
      rG[x] = vg < 1 ? vg : 1;
      rB[x] = vb < 1 ? vb : 1;
    }
    rR[w] = rR[w - 1]; rG[w] = rG[w - 1]; rB[w] = rB[w - 1];
    for (let x = 0, o = y * width; x < width; x++, o++) {
      const i = colI[x], t = colT[x];
      const br = rR[i] + (rR[i + 1] - rR[i]) * t;
      const bg = rG[i] + (rG[i + 1] - rG[i]) * t;
      const bb = rB[i] + (rB[i + 1] - rB[i]) * t;
      const p = src32[o];
      const sr = p & 255, sg = (p >>> 8) & 255, sb = (p >>> 16) & 255;
      // Screen: 255 − (255 − s)(1 − b), rounded.
      const r = (sr + (255 - sr) * br + 0.5) | 0;
      const g = (sg + (255 - sg) * bg + 0.5) | 0;
      const b = (sb + (255 - sb) * bb + 0.5) | 0;
      out32[o] = r | (g << 8) | (b << 16) | 0xff000000;
    }
  }
}

// 2x2 box downsample (edge cells average what they cover).
function halve(src, dst, w, h, w2, h2) {
  for (let y = 0; y < h2; y++) {
    const ya = y * 2 * w, yb = Math.min(h - 1, y * 2 + 1) * w;
    for (let x = 0; x < w2; x++) {
      const xa = x * 2, xb = Math.min(w - 1, xa + 1);
      dst[y * w2 + x] = (src[ya + xa] + src[ya + xb] + src[yb + xa] + src[yb + xb]) * 0.25;
    }
  }
}

// Bilinear 2x upsample of src (w2 x h2) added into out (w x h) with weight.
function addDoubled(src, out, w2, h2, w, h, wgt) {
  for (let y = 0; y < h; y++) {
    const fy = Math.min(h2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = fy | 0, y1 = Math.min(h2 - 1, y0 + 1), ty = fy - y0;
    const a = y0 * w2, c = y1 * w2;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(w2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = fx | 0, x1 = Math.min(w2 - 1, x0 + 1), tx = fx - x0;
      const top = src[a + x0] + (src[a + x1] - src[a + x0]) * tx;
      const bot = src[c + x0] + (src[c + x1] - src[c + x0]) * tx;
      out[y * w + x] += (top + (bot - top) * ty) * wgt;
    }
  }
}
