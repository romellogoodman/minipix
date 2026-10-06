import { randFloat, createNoise2D } from "../utils.js";

// IJG reference quantization tables (quality 50).
const LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array(32).fill(99),
];

// Orthonormal DCT-II basis: COS[x * 8 + u] = C(u)/2 · cos((2x+1)uπ/16).
const COS = new Float32Array(64);
for (let x = 0; x < 8; x++) {
  for (let u = 0; u < 8; u++) {
    COS[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

// IJG quality → quantization steps for one table.
const stepsFor = (table, quality) => {
  const q = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  const out = new Float32Array(64);
  for (let i = 0; i < 64; i++) out[i] = Math.max(1, Math.min(255, Math.floor((table[i] * scale + 50) / 100)));
  return out;
};

// Forward DCT → quantize → inverse DCT, in place, on every 8×8 block of a
// w×h plane whose block grid starts at (ox, oy). Blocks hanging off the edge
// read clamped samples and only write back what's inside. `stepsAt(bx, by)`
// returns the quantization steps for a block; `dcOnly` drops all AC terms.
function quantizePlane(plane, w, h, ox, oy, stepsAt, dcOnly) {
  const blk = new Float32Array(64), tmp = new Float32Array(64), coef = new Float32Array(64);
  for (let by0 = -oy; by0 < h; by0 += 8) {
    for (let bx0 = -ox; bx0 < w; bx0 += 8) {
      for (let y = 0; y < 8; y++) {
        const sy = Math.min(h - 1, Math.max(0, by0 + y)) * w;
        for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[sy + Math.min(w - 1, Math.max(0, bx0 + x))] - 128;
      }
      // Rows, then columns.
      for (let y = 0; y < 8; y++) {
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let x = 0; x < 8; x++) s += blk[y * 8 + x] * COS[x * 8 + u];
          tmp[y * 8 + u] = s;
        }
      }
      const steps = stepsAt(bx0 + 4, by0 + 4);
      for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
          const i = v * 8 + u;
          if (dcOnly && i > 0) { coef[i] = 0; continue; }
          let s = 0;
          for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y * 8 + v];
          coef[i] = Math.round(s / steps[i]) * steps[i];
        }
      }
      // Inverse: columns, then rows.
      for (let y = 0; y < 8; y++) {
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let v = 0; v < 8; v++) s += coef[v * 8 + u] * COS[y * 8 + v];
          tmp[y * 8 + u] = s;
        }
      }
      for (let y = 0; y < 8; y++) {
        const py = by0 + y;
        if (py < 0 || py >= h) continue;
        for (let x = 0; x < 8; x++) {
          const px = bx0 + x;
          if (px < 0 || px >= w) continue;
          let s = 0;
          for (let u = 0; u < 8; u++) s += tmp[y * 8 + u] * COS[x * 8 + u];
          plane[py * w + px] = s + 128;
        }
      }
    }
  }
}

export default function compression({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  // The shader stretches each DCT sample over a few device pixels so the
  // blocks read at screen size; here a "cell" is a fraction of the image.
  const cell = Math.max(1, Math.round(minDim * randFloat(config.cellPercent, random)));
  const quality = randFloat(config.quality, random);
  const regional = random() < config.regionProbability;
  const regionQuality = randFloat(config.regionQuality, random);
  const regionScale = randFloat(config.regionScale, random);
  const dcChroma = random() < config.dcChromaProbability;
  const chromaShift = Math.round(randFloat(config.chromaShift, random) * 8);
  // Chroma gain before encoding, "deep-fried" style, so the colour bleed reads.
  const chromaGain = randFloat(config.chromaGain, random);
  const recompress = random() < config.recompressProbability;
  const reOx = 1 + Math.floor(random() * 7);
  const reOy = 1 + Math.floor(random() * 7);
  const reQuality = randFloat(config.quality, random);
  const noise = createNoise2D(random);

  // Cell-averaged YCbCr planes.
  const w = Math.ceil(width / cell), h = Math.ceil(height / cell);
  const Y = new Float32Array(w * h), Cb = new Float32Array(w * h), Cr = new Float32Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    const y0 = cy * cell, y1 = Math.min(height, y0 + cell);
    for (let cx = 0; cx < w; cx++) {
      const x0 = cx * cell, x1 = Math.min(width, x0 + cell);
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0, i = (y * width + x0) * 4; x < x1; x++, i += 4) {
          r += imageData[i]; g += imageData[i + 1]; b += imageData[i + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      r /= n; g /= n; b /= n;
      const p = cy * w + cx;
      Y[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[p] = 128 + chromaGain * (-0.168736 * r - 0.331264 * g + 0.5 * b);
      Cr[p] = 128 + chromaGain * (0.5 * r - 0.418688 * g - 0.081312 * b);
    }
  }

  // Per-block quality: constant, or wandering between the two qualities on
  // low-frequency noise so some regions are far more destroyed than others.
  const lumaSteps = new Map(), chromaSteps = new Map();
  const cached = (cache, table, q) => {
    const key = Math.round(q * 4);
    let s = cache.get(key);
    if (!s) cache.set(key, (s = stepsFor(table, key / 4)));
    return s;
  };
  const freq = regionScale / Math.max(w, h);
  const qualityAt = (base, x, y) => {
    if (!regional) return base;
    const t = Math.min(1, Math.max(0, noise(x * freq, y * freq) * 1.6 + 0.5));
    return base + (regionQuality - base) * t * t * (3 - 2 * t);
  };

  quantizePlane(Y, w, h, 0, 0, (x, y) => cached(lumaSteps, LUMA_Q, qualityAt(quality, x, y)), false);
  if (recompress) {
    // A second save on a shifted grid layers a second set of block edges.
    quantizePlane(Y, w, h, reOx, reOy, (x, y) => cached(lumaSteps, LUMA_Q, qualityAt(reQuality, x, y)), false);
  }

  // 4:2:0 chroma: halve, quantize, and read back with nearest upsampling so
  // colour bleeds in 16-cell squares (optionally offset from the luma grid).
  const cw = Math.ceil(w / 2), ch = Math.ceil(h / 2);
  const sub = (plane) => {
    const out = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const ya = Math.min(h - 1, y * 2), yb = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < cw; x++) {
        const xa = Math.min(w - 1, x * 2), xb = Math.min(w - 1, x * 2 + 1);
        out[y * cw + x] = (plane[ya * w + xa] + plane[ya * w + xb] + plane[yb * w + xa] + plane[yb * w + xb]) / 4;
      }
    }
    return out;
  };
  const sCb = sub(Cb), sCr = sub(Cr);
  // Chroma gets a gentler quality so colour survives as blotches instead of greying out.
  const chromaAt = (x, y) => cached(chromaSteps, CHROMA_Q, 2 * qualityAt(quality, x * 2, y * 2));
  quantizePlane(sCb, cw, ch, 0, 0, chromaAt, dcChroma);
  quantizePlane(sCr, cw, ch, 0, 0, chromaAt, dcChroma);

  // Back to RGB, one cell per output block.
  const row = new Uint8ClampedArray(w * 3);
  for (let cy = 0; cy < h; cy++) {
    const sy = Math.min(ch - 1, Math.max(0, (cy + chromaShift) >> 1)) * cw;
    for (let cx = 0; cx < w; cx++) {
      const s = sy + Math.min(cw - 1, Math.max(0, (cx + chromaShift) >> 1));
      const yv = Y[cy * w + cx], cb = sCb[s] - 128, cr = sCr[s] - 128;
      row[cx * 3] = yv + 1.402 * cr;
      row[cx * 3 + 1] = yv - 0.344136 * cb - 0.714136 * cr;
      row[cx * 3 + 2] = yv + 1.772 * cb;
    }
    const y1 = Math.min(height, (cy + 1) * cell);
    for (let y = cy * cell; y < y1; y++) {
      let i = y * width * 4;
      for (let x = 0; x < width; x++, i += 4) {
        const c = ((x / cell) | 0) * 3;
        outputData[i] = row[c];
        outputData[i + 1] = row[c + 1];
        outputData[i + 2] = row[c + 2];
        outputData[i + 3] = 255;
      }
    }
  }
}
