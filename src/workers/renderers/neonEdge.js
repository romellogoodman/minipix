import { randInt, randFloat } from "../utils.js";

const NEON = [
  [255, 20, 147],
  [0, 255, 255],
  [57, 255, 20],
  [255, 255, 0],
  [191, 0, 255],
  [255, 110, 0],
];

/**
 * Sobel edges coloured by gradient direction, over a darkened copy of the
 * image, plus a box-blurred glow of the edges. Everything streams row by row:
 * a 3-row luminance window feeds the Sobel, edge colours and their horizontal
 * box sums go into ring buffers of 2·glowRadius + 2 rows, and running column
 * sums give the vertical box blur as each output row is composed.
 */
export default function neonEdge({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const darken = randFloat(config.darken, random);
  const glowRadius = randInt(config.glowRadius, random);
  const numHues = randInt(config.numHues, random);

  // Distinct hues via partial Fisher-Yates
  const pool = NEON.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hues = pool.slice(0, numHues);
  const hueFlat = new Float64Array(numHues * 3);
  hues.forEach((h, i) => hueFlat.set(h, i * 3));

  run(imageData, width, height, outputData, threshold, darken, glowRadius | 0, numHues, hueFlat);
}

function run(imageData, width, height, outputData, threshold, darken, gr, numHues, hueFlat) {
  const maxX = width - 1;
  const maxY = height - 1;
  const slots = gr * 2 + 2;
  const rowLen = width * 3;
  const edgeRing = new Float32Array(slots * rowLen);
  const hRing = new Float32Array(slots * rowLen);
  const hasEdge = new Uint8Array(slots);
  const lumRing = new Float32Array(3 * width);
  const col = new Float64Array(rowLen);
  const win = gr * 2 + 1;
  const inv = 1 / win;
  const thr2 = threshold * 1020 * (threshold * 1020);
  const hueScale = numHues / (Math.PI * 2);
  const HALF_PI = Math.PI / 2;

  const lumRow = (y) => {
    const o = (y % 3) * width;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      lumRing[o + x] = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
    }
  };

  // Edge colours of row y into its ring slot, then that row's horizontal box sums.
  const edgeRow = (y) => {
    const slot = (y % slots) * rowLen;
    let any = 0;
    edgeRing.fill(0, slot, slot + rowLen);
    if (y > 0 && y < maxY) {
      if (y + 1 <= maxY) lumRow(y + 1);
      const up = ((y - 1) % 3) * width, mid = (y % 3) * width, dn = ((y + 1) % 3) * width;
      // Sliding 3x3 window: each step loads only the new right column.
      let tl = lumRing[up], t = lumRing[up + 1];
      let l = lumRing[mid], c = lumRing[mid + 1];
      let bl = lumRing[dn], b = lumRing[dn + 1];
      for (let x = 1; x < maxX; x++) {
        const tr = lumRing[up + x + 1], r = lumRing[mid + x + 1], br = lumRing[dn + x + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;
        tl = t; t = tr; l = c; c = r; bl = b; b = br;
        const m2 = gx * gx + gy * gy;
        if (m2 <= thr2) continue;
        const mag = Math.sqrt(m2) / 1020;
        let k = 0;
        if (numHues > 1) {
          // atan2 via a minimax polynomial (~1e-5 rad), shifted to [0, 2π).
          const ax = Math.abs(gx), ay = Math.abs(gy);
          let a;
          if (ax >= ay) {
            const q = ay / ax, s = q * q;
            a = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * q + q;
          } else {
            const q = ax / ay, s = q * q;
            a = HALF_PI - (((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * q + q);
          }
          if (gx < 0) a = Math.PI - a;
          if (gy < 0) a = -a;
          k = Math.floor((a + Math.PI) * hueScale) % numHues;
        }
        const e = slot + x * 3, h = k * 3;
        edgeRing[e] = hueFlat[h] * mag;
        edgeRing[e + 1] = hueFlat[h + 1] * mag;
        edgeRing[e + 2] = hueFlat[h + 2] * mag;
        any = 1;
      }
    }
    hasEdge[y % slots] = any;
    if (!any) {
      hRing.fill(0, slot, slot + rowLen);
      return;
    }
    // Horizontal running box sum with clamped edges.
    let sr = 0, sg = 0, sb = 0;
    for (let k = -gr; k <= gr; k++) {
      const j = slot + (k < 0 ? 0 : k > maxX ? maxX : k) * 3;
      sr += edgeRing[j]; sg += edgeRing[j + 1]; sb += edgeRing[j + 2];
    }
    for (let x = 0, o = slot; x < width; x++, o += 3) {
      hRing[o] = sr * inv; hRing[o + 1] = sg * inv; hRing[o + 2] = sb * inv;
      const ad = x + gr + 1, sub = x - gr;
      const ja = slot + (ad > maxX ? maxX : ad) * 3, js = slot + (sub < 0 ? 0 : sub) * 3;
      sr += edgeRing[ja] - edgeRing[js];
      sg += edgeRing[ja + 1] - edgeRing[js + 1];
      sb += edgeRing[ja + 2] - edgeRing[js + 2];
    }
  };
  const addRow = (y, sign) => {
    if (!hasEdge[y % slots]) return;
    const slot = (y % slots) * rowLen;
    if (sign > 0) for (let j = 0; j < rowLen; j++) col[j] += hRing[slot + j];
    else for (let j = 0; j < rowLen; j++) col[j] -= hRing[slot + j];
  };

  // Prime: luminance rows 0-1, edge rows 0..gr+... and the clamped column sums.
  lumRow(0);
  if (maxY >= 1) lumRow(1);
  let next = 0; // next edge row to compute
  const need = (y) => {
    while (next <= y && next <= maxY) edgeRow(next++);
  };
  need(Math.min(maxY, gr));
  for (let k = -gr; k <= gr; k++) addRow(k < 0 ? 0 : k > maxY ? maxY : k, 1);

  const glowK = inv * 2;
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const slot = (y % slots) * rowLen;
    const lit = hasEdge[y % slots];
    for (let x = 0, i = y * width * 4, o = y * width, j = 0; x < width; x++, i += 4, o++, j += 3) {
      let r = imageData[i] * darken + col[j] * glowK;
      let g = imageData[i + 1] * darken + col[j + 1] * glowK;
      let b = imageData[i + 2] * darken + col[j + 2] * glowK;
      if (lit) {
        r += edgeRing[slot + j]; g += edgeRing[slot + j + 1]; b += edgeRing[slot + j + 2];
      }
      r = r > 255 ? 255 : (r + 0.5) | 0;
      g = g > 255 ? 255 : (g + 0.5) | 0;
      b = b > 255 ? 255 : (b + 0.5) | 0;
      out32[o] = r | (g << 8) | (b << 16) | 0xff000000;
    }
    // Slide the column window: add row y + gr + 1, drop row y - gr (clamped).
    const ad = y + gr + 1;
    need(ad > maxY ? maxY : ad);
    addRow(ad > maxY ? maxY : ad, 1);
    addRow(y - gr < 0 ? 0 : y - gr, -1);
  }
}
