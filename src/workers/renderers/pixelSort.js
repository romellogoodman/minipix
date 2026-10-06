import { randFloat } from "../utils.js";

// Transpose a rows x cols Uint32 matrix into dst (cols x rows), in cache-sized tiles.
const transpose = (src, dst, rows, cols) => {
  const T = 64;
  for (let r0 = 0; r0 < rows; r0 += T) {
    const r1 = Math.min(rows, r0 + T);
    for (let c0 = 0; c0 < cols; c0 += T) {
      const c1 = Math.min(cols, c0 + T);
      for (let r = r0; r < r1; r++) {
        let s = r * cols + c0;
        for (let c = c0, d = c0 * rows + r; c < c1; c++, d += rows) dst[d] = src[s++];
      }
    }
  }
};

export default function pixelSort({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const sortLengthPercent = randFloat(config.sortLength, random);
  const isVertical = random() < 0.5;
  const reverse = random() < config.reverseProbability;

  const n = width * height;
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, n);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);

  // Work on lines laid out contiguously: rows as-is, or the transposed image
  // when sorting columns. Runs never overlap and each run is sorted only after
  // the scan has passed it, so luminance can be read from the source.
  const lineCount = isVertical ? width : height;
  const lineLen = isVertical ? height : width;
  let lines = out32;
  if (isVertical) {
    lines = new Uint32Array(n);
    transpose(src32, lines, height, width);
  } else {
    out32.set(src32);
  }

  // Luminance tables: the float form decides the threshold exactly as
  // (0.299 r + 0.587 g + 0.114 b) / 255; the integer form 299 r + 587 g + 114 b
  // is the sort key (same order, cheap to radix sort).
  const lr = new Float64Array(256), lg = new Float64Array(256), lb = new Float64Array(256);
  const kr = new Int32Array(256), kg = new Int32Array(256), kb = new Int32Array(256);
  for (let v = 0; v < 256; v++) {
    lr[v] = 0.299 * v; lg[v] = 0.587 * v; lb[v] = 0.114 * v;
    kr[v] = 299 * v; kg[v] = 587 * v; kb[v] = 114 * v;
  }

  // Threshold test: integer keys clearly on one side of threshold * 255000
  // are decided directly; only keys right at the boundary need the float form.
  const kMid = threshold * 255000;
  const kLo = Math.floor(kMid) - 2;
  const kHi = Math.ceil(kMid) + 2;

  // Stable sort of each run by key (ties keep their original order): a
  // counting sort or a two-digit LSD radix sort that moves the pixels
  // themselves, or insertion sort for short runs.
  const RADIX_BITS = 9;
  const RADIX = 1 << RADIX_BITS;
  const MASK = RADIX - 1;
  const counts = new Uint32Array(2048);
  const countsHi = new Uint32Array(RADIX);
  const runKeys = new Int32Array(lineLen);
  const keys = new Uint32Array(lineLen), keysAlt = new Uint32Array(lineLen);
  const pix = new Uint32Array(lineLen), pixAlt = new Uint32Array(lineLen);

  const sortRun = (base, len) => {
    const m = Math.floor(len * sortLengthPercent);
    if (m <= 1) return;
    let lo = 0x7fffffff, hi = 0;
    for (let i = 0; i < m; i++) {
      const k = runKeys[i];
      if (k < lo) lo = k;
      if (k > hi) hi = k;
    }
    if (reverse) for (let i = 0; i < m; i++) keys[i] = hi - runKeys[i];
    else for (let i = 0; i < m; i++) keys[i] = runKeys[i] - lo;
    const range = hi - lo;
    pix.set(lines.subarray(base, base + m));

    if (m <= 64) {
      for (let i = 1; i < m; i++) {
        const k = keys[i], v = pix[i];
        let j = i - 1;
        while (j >= 0 && keys[j] > k) { keys[j + 1] = keys[j]; pix[j + 1] = pix[j]; j--; }
        keys[j + 1] = k;
        pix[j + 1] = v;
      }
      lines.set(pix.subarray(0, m), base);
    } else if (range < 2048) {
      counts.fill(0, 0, range + 1);
      for (let i = 0; i < m; i++) counts[keys[i]]++;
      for (let d = 0, sum = base; d <= range; d++) { const c = counts[d]; counts[d] = sum; sum += c; }
      for (let i = 0; i < m; i++) lines[counts[keys[i]]++] = pix[i];
    } else {
      counts.fill(0, 0, RADIX);
      countsHi.fill(0);
      for (let i = 0; i < m; i++) {
        const k = keys[i];
        counts[k & MASK]++;
        countsHi[k >>> RADIX_BITS]++;
      }
      for (let d = 0, sum = 0, sumHi = base; d < RADIX; d++) {
        const c = counts[d]; counts[d] = sum; sum += c;
        const ch = countsHi[d]; countsHi[d] = sumHi; sumHi += ch;
      }
      for (let i = 0; i < m; i++) {
        const k = keys[i];
        const p = counts[k & MASK]++;
        keysAlt[p] = k;
        pixAlt[p] = pix[i];
      }
      for (let i = 0; i < m; i++) lines[countsHi[keysAlt[i] >>> RADIX_BITS]++] = pixAlt[i];
    }
  };

  for (let o = 0; o < lineCount; o++) {
    const line = o * lineLen;
    let start = -1;
    for (let i = 0; i < lineLen; i++) {
      const c = lines[line + i];
      const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
      const key = kr[r] + kg[g] + kb[b];
      const above = key > kHi || (key >= kLo && (lr[r] + lg[g] + lb[b]) / 255 > threshold);
      if (above) {
        if (start === -1) start = i;
        runKeys[i - start] = key;
      }
      if (start !== -1 && (!above || i === lineLen - 1)) {
        sortRun(line + start, (above ? i + 1 : i) - start);
        start = -1;
      }
    }
  }

  if (isVertical) transpose(lines, out32, width, height);
}
