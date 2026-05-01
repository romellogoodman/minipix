import { randFloat } from "../utils.js";

export default function pixelSort({ imageData, width, height, config, random, outputData }) {
  outputData.set(imageData);

  const threshold = randFloat(config.threshold, random);
  const sortLengthPercent = randFloat(config.sortLength, random);
  const isVertical = random() < 0.5;
  const reverse = random() < config.reverseProbability;

  const lumAt = (idx) =>
    (0.299 * outputData[idx] + 0.587 * outputData[idx + 1] + 0.114 * outputData[idx + 2]) / 255;

  // Sort a run of pixels along the given axis. Uses index+luminance pairs in
  // typed arrays instead of per-pixel objects, and preserves alpha.
  const stride = isVertical ? width * 4 : 4;
  const sortRun = (baseIdx, len) => {
    const n = Math.floor(len * sortLengthPercent);
    if (n <= 1) return;
    const order = new Uint32Array(n);
    const lums = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      order[i] = i;
      lums[i] = lumAt(baseIdx + i * stride);
    }
    order.sort(reverse ? (a, b) => lums[b] - lums[a] : (a, b) => lums[a] - lums[b]);
    const tmp = new Uint8ClampedArray(n * 4);
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
