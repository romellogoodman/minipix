import { randFloat } from "../utils.js";

export default function pixelSort({ imageData, width, height, config, random, outputData }) {
  outputData.set(imageData);

  const threshold = randFloat(config.threshold, random);
  const sortLengthPercent = randFloat(config.sortLength, random);
  const isVertical = random() < 0.5;
  const reverse = random() < config.reverseProbability;

  const lumAt = (idx) =>
    (0.299 * outputData[idx] + 0.587 * outputData[idx + 1] + 0.114 * outputData[idx + 2]) / 255;

  // Sort a run of pixels along the given axis, preserving alpha. Each run is
  // ordered by its float32 luminance with ties kept in original order (a stable
  // sort), done here as an LSD radix sort on the float's bits: luminance is
  // non-negative, so its bits order the same way as its value.
  const stride = isVertical ? width * 4 : 4;
  const maxLen = isVertical ? height : width;
  const RADIX_BITS = 8;
  const RADIX = 1 << RADIX_BITS;
  const counts = new Uint32Array(RADIX);
  let keys = new Uint32Array(maxLen), keysAlt = new Uint32Array(maxLen);
  let order = new Uint32Array(maxLen), orderAlt = new Uint32Array(maxLen);
  const lum32 = new Float32Array(1);
  const lumBits = new Uint32Array(lum32.buffer);
  const tmp = new Uint8ClampedArray(maxLen * 4);
  const insertionSort = (n) => {
    for (let i = 1; i < n; i++) {
      const k = keys[i];
      let j = i - 1;
      while (j >= 0 && keys[j] > k) { keys[j + 1] = keys[j]; order[j + 1] = order[j]; j--; }
      keys[j + 1] = k;
      order[j + 1] = i;
    }
  };
  const radixSort = (n, range) => {
    for (let shift = 0; range > 0; shift += RADIX_BITS, range = Math.floor(range / RADIX)) {
      counts.fill(0);
      for (let i = 0; i < n; i++) counts[(keys[i] >>> shift) & (RADIX - 1)]++;
      for (let d = 0, sum = 0; d < RADIX; d++) { const c = counts[d]; counts[d] = sum; sum += c; }
      for (let i = 0; i < n; i++) {
        const k = keys[i];
        const p = counts[(k >>> shift) & (RADIX - 1)]++;
        keysAlt[p] = k;
        orderAlt[p] = order[i];
      }
      [keys, keysAlt] = [keysAlt, keys];
      [order, orderAlt] = [orderAlt, order];
    }
  };
  const sortRun = (baseIdx, len) => {
    const n = Math.floor(len * sortLengthPercent);
    if (n <= 1) return;
    let lo = 0xffffffff, hi = 0;
    for (let i = 0; i < n; i++) {
      lum32[0] = lumAt(baseIdx + i * stride);
      const bits = lumBits[0];
      keys[i] = bits;
      order[i] = i;
      if (bits < lo) lo = bits;
      if (bits > hi) hi = bits;
    }
    for (let i = 0; i < n; i++) keys[i] = reverse ? hi - keys[i] : keys[i] - lo;
    if (n <= 64) insertionSort(n);
    else radixSort(n, hi - lo);
    for (let i = 0; i < n; i++) {
      const src = baseIdx + order[i] * stride;
      tmp[i * 4] = outputData[src];
      tmp[i * 4 + 1] = outputData[src + 1];
      tmp[i * 4 + 2] = outputData[src + 2];
      tmp[i * 4 + 3] = outputData[src + 3];
    }
    for (let i = 0; i < n; i++) {
      const dst = baseIdx + i * stride;
      outputData[dst] = tmp[i * 4];
      outputData[dst + 1] = tmp[i * 4 + 1];
      outputData[dst + 2] = tmp[i * 4 + 2];
      outputData[dst + 3] = tmp[i * 4 + 3];
    }
  };

  const outer = isVertical ? width : height;
  const inner = isVertical ? height : width;
  for (let o = 0; o < outer; o++) {
    let start = -1;
    for (let i = 0; i < inner; i++) {
      const idx = isVertical ? (i * width + o) * 4 : (o * width + i) * 4;
      const above = lumAt(idx) > threshold;
      if (above && start === -1) start = i;
      const atEnd = i === inner - 1;
      if (start !== -1 && (!above || atEnd)) {
        const end = above ? i + 1 : i;
        const baseIdx = isVertical ? (start * width + o) * 4 : (o * width + start) * 4;
        sortRun(baseIdx, end - start);
        start = -1;
      }
    }
  }
}
