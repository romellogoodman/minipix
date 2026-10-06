import { randInt } from "../utils.js";

// Squared Sobel magnitudes at or above this draw a fully black stroke
// (2 * sqrt(16257) > 255), so edge strengths are clamped here.
const EDGE_CAP = 16257;

export default function sketch({ imageData, width, height, config, random, outputData }) {
  const lineThickness = randInt(config.lineThickness, random);
  const edgeThreshold = randInt(config.edgeThreshold, random);
  const hatchingDensity = randInt(config.hatchingDensity, random);

  const n = width * height;
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, n);
  const lr = new Float64Array(256), lg = new Float64Array(256), lb = new Float64Array(256);
  for (let v = 0; v < 256; v++) { lr[v] = 0.299 * v; lg[v] = 0.587 * v; lb[v] = 0.114 * v; }
  const luminance = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const c = src32[p];
    luminance[p] = (lr[c & 255] + lg[(c >>> 8) & 255] + lb[(c >>> 16) & 255]) | 0;
  }

  // Hatch darkness per luminance byte (0 where that tone gets no hatching).
  const hatchDarkA = new Int32Array(256);
  const hatchDarkB = new Int32Array(256);
  for (let l = 0; l < 256; l++) {
    const lum = l / 255;
    if (lum < 0.7) hatchDarkA[l] = ((1 - lum) * 100) | 0;
    if (lum < 0.4) hatchDarkB[l] = ((1 - lum) * 80) | 0;
  }

  // Stroke value for an edge strength, as the float the original compared
  // against and as the byte it stored.
  const strokeF = new Float64Array(EDGE_CAP + 1);
  const strokeB = new Uint8ClampedArray(EDGE_CAP + 1);
  for (let e = 1; e <= EDGE_CAP; e++) {
    const edge = Math.sqrt(e);
    strokeF[e] = 255 - (edge * 2 > 255 ? 255 : edge * 2);
    strokeB[e] = strokeF[e];
  }

  const edgeThresholdSq = edgeThreshold * edgeThreshold;
  const h = lineThickness >> 1;
  const ringSize = 2 * h + 1;

  // Each edge pixel paints a (2h+1)^2 square keeping the darkest stroke, so
  // the stroke at a pixel is the max edge strength over that square. A pixel
  // whose square holds an edge earlier in scan order (rows above, or this row
  // at or left of it) was painted before its own hatching ran and keeps the
  // stroke; otherwise later strokes only replace the hatched paper where
  // darker. Rows are produced into small ring buffers and consumed h rows
  // later, so everything stays in cache.
  //   strengthRing: 0 = no edge, else squared Sobel magnitude clamped to EDGE_CAP
  //   maxRing:      max strength within +-h along the row
  const strengthRing = [], maxRing = [];
  for (let i = 0; i < ringSize; i++) {
    strengthRing.push(new Uint16Array(width));
    maxRing.push(h > 0 ? new Uint16Array(width) : strengthRing[i]);
  }
  const strokeRow = new Uint16Array(width);
  const earlyRow = new Uint16Array(width);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);

  const produceRow = (y) => {
    const strength = strengthRing[y % ringSize];
    strength.fill(0);
    if (y >= 1 && y < height - 1) {
      // Separable Sobel: gx = V[x+1] - V[x-1] with V = t + 2m + b per column,
      // gy = D[x-1] + 2D[x] + D[x+1] with D = b - t per column.
      const row = y * width, prev = row - width, next = row + width;
      let vL = luminance[prev] + 2 * luminance[row] + luminance[next];
      let dL = luminance[next] - luminance[prev];
      let vC = luminance[prev + 1] + 2 * luminance[row + 1] + luminance[next + 1];
      let dC = luminance[next + 1] - luminance[prev + 1];
      for (let x = 1; x < width - 1; x++) {
        const t = luminance[prev + x + 1], b = luminance[next + x + 1];
        const vR = t + 2 * luminance[row + x + 1] + b;
        const dR = b - t;
        const gx = vR - vL;
        const gy = dL + 2 * dC + dR;
        const e = gx * gx + gy * gy;
        if (e > edgeThresholdSq) strength[x] = e < EDGE_CAP ? e : EDGE_CAP;
        vL = vC; vC = vR; dL = dC; dC = dR;
      }
    }
    if (h > 0) {
      const max = maxRing[y % ringSize];
      for (let x = 0; x < width; x++) {
        let m = 0;
        const x0 = x - h < 0 ? 0 : x - h;
        const x1 = x + h > width - 1 ? width - 1 : x + h;
        for (let k = x0; k <= x1; k++) { const s = strength[k]; if (s > m) m = s; }
        max[x] = m;
      }
    }
  };

  for (let y = 0; y < h && y < height; y++) produceRow(y);
  for (let y = 0; y < height; y++) {
    if (y + h < height) produceRow(y + h);
    const rowOffset = y * width;
    const y0 = y - h < 0 ? 0 : y - h;
    const y1 = y + h > height - 1 ? height - 1 : y + h;

    // early = max strength over rows above and this row's [x-h, x];
    // stroke = max over the whole square. With h = 0 both are the pixel's own.
    const strength = strengthRing[y % ringSize];
    let early = strength, stroke = strength;
    if (h > 0) {
      early = earlyRow;
      stroke = strokeRow;
      earlyRow.fill(0);
      for (let py = y0; py < y; py++) {
        const m = maxRing[py % ringSize];
        for (let x = 0; x < width; x++) if (m[x] > earlyRow[x]) earlyRow[x] = m[x];
      }
      strokeRow.set(earlyRow);
      for (let py = y; py <= y1; py++) {
        const m = maxRing[py % ringSize];
        for (let x = 0; x < width; x++) if (m[x] > strokeRow[x]) strokeRow[x] = m[x];
      }
      for (let x = 0; x < width; x++) {
        let m = earlyRow[x];
        const x0 = x - h < 0 ? 0 : x - h;
        for (let k = x0; k <= x; k++) if (strength[k] > m) m = strength[k];
        earlyRow[x] = m;
      }
    }

    // Running values of (x + y) % hatchingDensity and (x - y + height) % hatchingDensity.
    let hatchA = y % hatchingDensity;
    let hatchB = (height - y) % hatchingDensity;

    for (let x = 0; x < width; x++) {
      const onHatchA = hatchA === 0;
      const onHatchB = hatchB === 0;
      if (++hatchA === hatchingDensity) hatchA = 0;
      if (++hatchB === hatchingDensity) hatchB = 0;

      const st = stroke[x];
      if (early[x] > 0) {
        const v = strokeB[st];
        out32[rowOffset + x] = 0xff000000 | (v << 16) | (v << 8) | v;
        continue;
      }

      const l = luminance[rowOffset + x];
      const dark = (onHatchA ? hatchDarkA[l] : 0) + (onHatchB ? hatchDarkB[l] : 0);
      let r = 250 - dark, g = 248 - dark, b = 245 - dark;
      if (r < 0) r = 0;
      if (g < 0) g = 0;
      if (b < 0) b = 0;
      if (st > 0 && r > strokeF[st]) {
        const v = strokeB[st];
        out32[rowOffset + x] = 0xff000000 | (v << 16) | (v << 8) | v;
      } else {
        out32[rowOffset + x] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
  }
}
