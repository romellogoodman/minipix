import { randFloat } from "../utils.js";

// Running-sum box blur of one channel, horizontal then vertical, in place.
function boxBlur(src, tmp, w, h, r) {
  if (r < 1) return;
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
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
  for (let sy = 0; sy < h; sy++) {
    const y0 = sy * f, y1 = Math.min(height, y0 + f);
    for (let sx = 0; sx < w; sx++) {
      const x0 = sx * f, x1 = Math.min(width, x0 + f);
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0, i = (y * width + x0) * 4; x < x1; x++, i += 4) {
          r += imageData[i]; g += imageData[i + 1]; b += imageData[i + 2];
        }
      }
      const k = 1 / (255 * (y1 - y0) * (x1 - x0));
      const p = sy * w + sx;
      R[p] = r * k; G[p] = g * k; B[p] = b * k;
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
  const work = new Float32Array(n), tmp = new Float32Array(n);
  const scales = [[1, 0.5], [1 / 3, 0.3], [1 / 9, 0.2]];
  for (const [chan, out] of [[eR, gR], [eG, gG], [eB, gB]]) {
    for (const [s, wgt] of scales) {
      const r = Math.max(1, Math.round((radius * s) / f / 1.7));
      work.set(chan);
      boxBlur(work, tmp, w, h, r);
      boxBlur(work, tmp, w, h, r);
      boxBlur(work, tmp, w, h, r);
      for (let p = 0; p < n; p++) out[p] += work[p] * wgt;
    }
  }

  // Bilinear upsample + screen blend.
  const gain = intensity * 2;
  const scale = 1 / f;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * scale - 0.5));
    const y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * scale - 0.5));
      const x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = y0 * w + x0, b = y0 * w + x1, c = y1 * w + x0, d = y1 * w + x1;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
      const i = (y * width + x) * 4;
      const br = Math.min(1, (gR[a] * wa + gR[b] * wb + gR[c] * wc + gR[d] * wd) * gain);
      const bg = Math.min(1, (gG[a] * wa + gG[b] * wb + gG[c] * wc + gG[d] * wd) * gain);
      const bb = Math.min(1, (gB[a] * wa + gB[b] * wb + gB[c] * wc + gB[d] * wd) * gain);
      outputData[i] = 255 - (255 - imageData[i]) * (1 - br);
      outputData[i + 1] = 255 - (255 - imageData[i + 1]) * (1 - bg);
      outputData[i + 2] = 255 - (255 - imageData[i + 2]) * (1 - bb);
      outputData[i + 3] = 255;
    }
  }

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
        for (let y = y0; y <= y1; y++) {
          const dy = y - py;
          for (let x = x0; x <= x1; x++) {
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
