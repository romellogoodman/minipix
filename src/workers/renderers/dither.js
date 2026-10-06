import { randInt, extractDominantColors } from "../utils.js";

// Exact nearest-palette lookup (as behind halftone's Bayer dither in
// utils/image.js). Colour space [-128, 384)³ is cut into 4-unit cells keyed
// (r+128)>>2 << 14 | (g+128)>>2 << 7 | (b+128)>>2 and classified lazily: a cell
// whose every point has the same nearest colour stores its index + 1; one
// straddling a boundary stores 255 and the caller falls back to `exact`.
const createNearestLookup = (palR, palG, palB) => {
  const n = palR.length;
  const exact = (r, g, b) => {
    let minDist = Infinity, best = 0;
    for (let p = 0; p < n; p++) {
      const dr = r - palR[p], dg = g - palG[p], db = b - palB[p];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) { minDist = dist; best = p; }
    }
    return best;
  };
  const lut = new Uint8Array(128 * 128 * 128);
  const margin = 4 * Math.sqrt(3) + 1e-6; // two half-diagonals of a cell
  const classify = (k) => {
    const cr = (k >> 14) * 4 - 126, cg = ((k >> 7) & 127) * 4 - 126, cb = (k & 127) * 4 - 126;
    let d1 = Infinity, d2 = Infinity, best = 0;
    for (let p = 0; p < n; p++) {
      const dr = cr - palR[p], dg = cg - palG[p], db = cb - palB[p];
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    return (lut[k] = d2 - d1 > margin ? best + 1 : 255);
  };
  return { lut, classify, exact };
};

export default function dither({ imageData, width, height, config, random, outputData }) {
  const numColors = randInt(config.numColors, random);
  const palette = extractDominantColors({ data: imageData, width, height }, numColors);

  const modes = ["atkinson", "ordered", "blueNoise"];
  const mode = modes[Math.floor(random() * modes.length)];

  // Duplicate colours can never win a first-minimum search, so drop them.
  const colors = palette.filter((c, i) => palette.findIndex((u) => u.r === c.r && u.g === c.g && u.b === c.b) === i);
  const numPal = colors.length;
  const palR = new Float64Array(colors.map((c) => c.r));
  const palG = new Float64Array(colors.map((c) => c.g));
  const palB = new Float64Array(colors.map((c) => c.b));
  const words = new Int32Array(numPal);
  new Uint8Array(words.buffer).set(colors.flatMap((c) => [c.r, c.g, c.b, 255]));
  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, width * height);

  // Adds a size×size threshold tile, repeated across the image, before quantizing.
  // Thresholds stay within ±64, so v + t + 128 is always inside the lookup's
  // range, and its cell index floor((v + t + 128) / 4) equals
  // (v + floor(t) + 128) >> 2 for integer v — no float math on the fast path.
  const tileThreshold = (thresholds, size) => {
    const { lut, classify, exact } = createNearestLookup(palR, palG, palB);
    const ti = Int32Array.from(thresholds, (t) => Math.floor(t) + 128);
    for (let y = 0, p = 0; y < height; y++) {
      const rowBase = (y % size) * size;
      for (let x = 0, tx = rowBase, tEnd = rowBase + size; x < width; x++, p++) {
        const idx = p * 4;
        const o = ti[tx];
        const r = imageData[idx], g = imageData[idx + 1], b = imageData[idx + 2];
        const k = ((r + o) >> 2 << 14) | ((g + o) >> 2 << 7) | ((b + o) >> 2);
        let e = lut[k];
        if (e === 0) e = classify(k);
        if (e !== 255) out32[p] = words[e - 1];
        else { const t = thresholds[tx]; out32[p] = words[exact(r + t, g + t, b + t)]; }
        if (++tx === tEnd) tx = rowBase;
      }
    }
  };

  if (mode === "atkinson") {
    // Atkinson spreads 1/8 of the error to (x+1, y), (x+2, y), (x-1, y+1), (x, y+1), (x+1, y+1), (x, y+2).
    // Error rows y, y+1, y+2 roll through three float32 buffers, and sums still
    // in flight stay in locals; every cell gets the same float32-rounded adds in
    // the same order as with a full-image error buffer.
    const fr = Math.fround;
    const row = width * 3;
    let e0 = new Float32Array(row), e1 = new Float32Array(row), e2 = new Float32Array(row);

    for (let y = 0; y < height; y++) {
      const has1 = y + 1 < height;
      const has2 = y + 2 < height;
      // Errors from x-2 and x-1 still owed to this row's cell x.
      let q2R = 0, q2G = 0, q2B = 0, q1R = 0, q1G = 0, q1B = 0;
      // Next-row partial sums for cells x-1 (a) and x (b).
      let aR = 0, aG = 0, aB = 0, bR = e1[0], bG = e1[1], bB = e1[2];
      for (let x = 0, p = y * width, idx = p * 4, ei = 0; x < width; x++, p++, idx += 4, ei += 3) {
        const r = imageData[idx] + fr(fr(e0[ei] + q2R) + q1R);
        const g = imageData[idx + 1] + fr(fr(e0[ei + 1] + q2G) + q1G);
        const b = imageData[idx + 2] + fr(fr(e0[ei + 2] + q2B) + q1B);
        // Error diffusion keeps values on palette boundaries, where the
        // lookup can't decide, so search the palette directly.
        let minDist = Infinity, c = 0;
        for (let q = 0; q < numPal; q++) {
          const dr = r - palR[q], dg = g - palG[q], db = b - palB[q];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) { minDist = dist; c = q; }
        }
        out32[p] = words[c];

        const eR = (r - palR[c]) / 8, eG = (g - palG[c]) / 8, eB = (b - palB[c]) / 8;
        q2R = q1R; q2G = q1G; q2B = q1B;
        q1R = eR; q1G = eG; q1B = eB;
        if (has1) {
          if (x > 0) { e1[ei - 3] = fr(aR + eR); e1[ei - 2] = fr(aG + eG); e1[ei - 1] = fr(aB + eB); }
          aR = fr(bR + eR); aG = fr(bG + eG); aB = fr(bB + eB);
          if (x + 1 < width) { bR = fr(e1[ei + 3] + eR); bG = fr(e1[ei + 4] + eG); bB = fr(e1[ei + 5] + eB); }
        }
        if (has2) { e2[ei] = fr(eR); e2[ei + 1] = fr(eG); e2[ei + 2] = fr(eB); }
      }
      if (has1) { const ei = row - 3; e1[ei] = aR; e1[ei + 1] = aG; e1[ei + 2] = aB; }
      const t = e0; e0 = e1; e1 = e2; e2 = t;
    }
  } else if (mode === "ordered") {
    const bayerN = 1 << randInt(config.bayerSize, random);
    const buildBayer = (size) => {
      const m = new Float32Array(size * size);
      if (size === 2) { m[0] = 0; m[1] = 2; m[2] = 3; m[3] = 1; return m; }
      const half = size >> 1;
      const sub = buildBayer(half);
      const quad = [0, 2, 3, 1];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const q = (y < half ? 0 : 1) * 2 + (x < half ? 0 : 1);
          m[y * size + x] = 4 * sub[(y % half) * half + (x % half)] + quad[q];
        }
      }
      return m;
    };
    const bayer = buildBayer(bayerN);
    const scale = 1 / (bayerN * bayerN);

    const thresholds = new Float64Array(bayer.length);
    for (let i = 0; i < bayer.length; i++) thresholds[i] = (bayer[i] * scale - 0.5) * 128;
    tileThreshold(thresholds, bayerN);
  } else {
    const noiseSize = randInt(config.blueNoiseScale, random);
    const noise = new Float32Array(noiseSize * noiseSize);
    for (let i = 0; i < noise.length; i++) noise[i] = random();

    // Void-and-cluster approximation: push each cell away from its 5×5 neighbor mean.
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < noiseSize; y++) {
        for (let x = 0; x < noiseSize; x++) {
          let sum = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = ((x + dx) % noiseSize + noiseSize) % noiseSize;
              const ny = ((y + dy) % noiseSize + noiseSize) % noiseSize;
              sum += noise[ny * noiseSize + nx];
            }
          }
          const i = y * noiseSize + x;
          noise[i] = Math.max(0, Math.min(1, noise[i] + (noise[i] - sum / 24) * 0.3));
        }
      }
    }

    const thresholds = new Float64Array(noise.length);
    for (let i = 0; i < noise.length; i++) thresholds[i] = (noise[i] - 0.5) * 128;
    tileThreshold(thresholds, noiseSize);
  }
}
