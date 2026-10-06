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
  // 8-point DCT via even/odd halves: COS[(7-x)*8+u] = (-1)^u COS[x*8+u], so each
  // output needs 4 products instead of 8 (same terms, paired before multiplying).
  for (let by0 = -oy; by0 < h; by0 += 8) {
    for (let bx0 = -ox; bx0 < w; bx0 += 8) {
      const inside = bx0 >= 0 && bx0 + 8 <= w && by0 >= 0 && by0 + 8 <= h;
      for (let y = 0; y < 8; y++) {
        if (inside) {
          const sy = (by0 + y) * w + bx0;
          for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[sy + x] - 128;
        } else {
          const sy = Math.min(h - 1, Math.max(0, by0 + y)) * w;
          for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[sy + Math.min(w - 1, Math.max(0, bx0 + x))] - 128;
        }
      }
      // Rows, then columns.
      for (let y = 0; y < 8; y++) {
        const r = y * 8;
        const e0 = blk[r] + blk[r + 7], e1 = blk[r + 1] + blk[r + 6], e2 = blk[r + 2] + blk[r + 5], e3 = blk[r + 3] + blk[r + 4];
        const o0 = blk[r] - blk[r + 7], o1 = blk[r + 1] - blk[r + 6], o2 = blk[r + 2] - blk[r + 5], o3 = blk[r + 3] - blk[r + 4];
        for (let u = 0; u < 8; u += 2) {
          tmp[r + u] = e0 * COS[u] + e1 * COS[8 + u] + e2 * COS[16 + u] + e3 * COS[24 + u];
          tmp[r + u + 1] = o0 * COS[u + 1] + o1 * COS[9 + u] + o2 * COS[17 + u] + o3 * COS[25 + u];
        }
      }
      const steps = stepsAt(bx0 + 4, by0 + 4);
      if (dcOnly) {
        let s = 0;
        for (let y = 0; y < 8; y++) s += tmp[y * 8] * COS[y * 8];
        // Only DC survives: the block becomes flat.
        const dc = Math.round(s / steps[0]) * steps[0];
        const flat = Math.fround(dc * COS[0]) * COS[0];
        for (let y = 0; y < 8; y++) {
          const py = by0 + y;
          if (py < 0 || py >= h) continue;
          for (let x = 0; x < 8; x++) {
            const px = bx0 + x;
            if (px >= 0 && px < w) plane[py * w + px] = flat + 128;
          }
        }
        continue;
      }
      // Low qualities zero most coefficients; track which columns survive so
      // the inverse skips them (adding 0 terms changes nothing).
      let liveCols = 0;
      for (let u = 0; u < 8; u++) {
        const e0 = tmp[u] + tmp[56 + u], e1 = tmp[8 + u] + tmp[48 + u], e2 = tmp[16 + u] + tmp[40 + u], e3 = tmp[24 + u] + tmp[32 + u];
        const o0 = tmp[u] - tmp[56 + u], o1 = tmp[8 + u] - tmp[48 + u], o2 = tmp[16 + u] - tmp[40 + u], o3 = tmp[24 + u] - tmp[32 + u];
        for (let v = 0; v < 8; v++) {
          const s = v & 1
            ? o0 * COS[v] + o1 * COS[8 + v] + o2 * COS[16 + v] + o3 * COS[24 + v]
            : e0 * COS[v] + e1 * COS[8 + v] + e2 * COS[16 + v] + e3 * COS[24 + v];
          const i = v * 8 + u;
          const q = Math.round(s / steps[i]) * steps[i];
          coef[i] = q;
          if (q !== 0) liveCols |= 1 << u;
        }
      }
      // Inverse: columns, then rows; outputs y and 7-y share the even/odd sums.
      for (let u = 0; u < 8; u++) {
        if (!(liveCols & (1 << u))) {
          for (let y = 0; y < 8; y++) tmp[y * 8 + u] = 0;
          continue;
        }
        const c0 = coef[u], c1 = coef[8 + u], c2 = coef[16 + u], c3 = coef[24 + u];
        const c4 = coef[32 + u], c5 = coef[40 + u], c6 = coef[48 + u], c7 = coef[56 + u];
        for (let y = 0; y < 4; y++) {
          const k = y * 8;
          const E = c0 * COS[k] + c2 * COS[k + 2] + c4 * COS[k + 4] + c6 * COS[k + 6];
          const O = c1 * COS[k + 1] + c3 * COS[k + 3] + c5 * COS[k + 5] + c7 * COS[k + 7];
          tmp[k + u] = E + O;
          tmp[(7 - y) * 8 + u] = E - O;
        }
      }
      for (let y = 0; y < 8; y++) {
        const py = by0 + y;
        if (py < 0 || py >= h) continue;
        const r = y * 8;
        const t0 = tmp[r], t1 = tmp[r + 1], t2 = tmp[r + 2], t3 = tmp[r + 3];
        const t4 = tmp[r + 4], t5 = tmp[r + 5], t6 = tmp[r + 6], t7 = tmp[r + 7];
        for (let x = 0; x < 4; x++) {
          const k = x * 8;
          const E = t0 * COS[k] + t2 * COS[k + 2] + t4 * COS[k + 4] + t6 * COS[k + 6];
          const O = t1 * COS[k + 1] + t3 * COS[k + 3] + t5 * COS[k + 5] + t7 * COS[k + 7];
          const pa = bx0 + x, pb = bx0 + 7 - x;
          if (pa >= 0 && pa < w) plane[py * w + pa] = E + O + 128;
          if (pb >= 0 && pb < w) plane[py * w + pb] = E - O + 128;
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
  // Integer channel sums per cell column, accumulated row by row in memory order.
  const sums = new Int32Array(w * 3);
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const src32 = littleEndian && imageData.byteOffset % 4 === 0 && cell < 257
    ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height) : null;
  for (let cy = 0; cy < h; cy++) {
    const y0 = cy * cell, y1 = Math.min(height, y0 + cell);
    sums.fill(0);
    for (let y = y0; y < y1; y++) {
      if (src32) {
        // One 32-bit read per pixel; R and B add in separate 16-bit lanes
        // (a cell row is far below 257 pixels, so lanes can't overflow).
        let p = y * width;
        for (let cx = 0, x = 0; cx < w; cx++) {
          const x1 = Math.min(width, x + cell);
          let rb = 0, g = 0;
          for (; x < x1; x++, p++) { const v = src32[p]; rb += v & 0xff00ff; g += (v >>> 8) & 0xff; }
          sums[cx * 3] += rb & 0xffff; sums[cx * 3 + 1] += g; sums[cx * 3 + 2] += rb >>> 16;
        }
        continue;
      }
      let i = y * width * 4;
      for (let cx = 0, x = 0; cx < w; cx++) {
        const x1 = Math.min(width, x + cell);
        let r = 0, g = 0, b = 0;
        for (; x < x1; x++, i += 4) { r += imageData[i]; g += imageData[i + 1]; b += imageData[i + 2]; }
        sums[cx * 3] += r; sums[cx * 3 + 1] += g; sums[cx * 3 + 2] += b;
      }
    }
    for (let cx = 0; cx < w; cx++) {
      const x0 = cx * cell, x1 = Math.min(width, x0 + cell);
      const n = (y1 - y0) * (x1 - x0);
      const r = sums[cx * 3] / n, g = sums[cx * 3 + 1] / n, b = sums[cx * 3 + 2] / n;
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

  // Back to RGB, one cell per output block: build each block row's pixel
  // words once, then copy it down the block.
  const row = new Uint8ClampedArray(w * 4);
  const rowWords = new Int32Array(row.buffer);
  const line = new Int32Array(width);
  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let cy = 0; cy < h; cy++) {
    const sy = Math.min(ch - 1, Math.max(0, (cy + chromaShift) >> 1)) * cw;
    for (let cx = 0; cx < w; cx++) {
      const s = sy + Math.min(cw - 1, Math.max(0, (cx + chromaShift) >> 1));
      const yv = Y[cy * w + cx], cb = sCb[s] - 128, cr = sCr[s] - 128;
      row[cx * 4] = yv + 1.402 * cr;
      row[cx * 4 + 1] = yv - 0.344136 * cb - 0.714136 * cr;
      row[cx * 4 + 2] = yv + 1.772 * cb;
      row[cx * 4 + 3] = 255;
    }
    for (let cx = 0, x = 0; cx < w; cx++) {
      const x1 = Math.min(width, x + cell), word = rowWords[cx];
      for (; x < x1; x++) line[x] = word;
    }
    const y1 = Math.min(height, (cy + 1) * cell);
    for (let y = cy * cell; y < y1; y++) out32.set(line, y * width);
  }
}
