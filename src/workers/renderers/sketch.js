import { randomNumber } from "../utils.js";

export default function sketch({ imageData, width, height, config, random, outputData }) {
  const lineThickness = randomNumber(config.lineThickness.min, config.lineThickness.max, random);
  const edgeThreshold = randomNumber(config.edgeThreshold.min, config.edgeThreshold.max, random);
  const hatchingDensity = randomNumber(config.hatchingDensity.min, config.hatchingDensity.max, random);

  const luminance = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    luminance[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) | 0;
  }

  // Squared Sobel magnitude; it can reach ~2.08M, so Uint16 would overflow.
  const edges = new Uint32Array(width * height);
  const edgeThresholdSq = edgeThreshold * edgeThreshold;
  const halfThick = lineThickness >> 1;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const tl = luminance[prevRow + x - 1];
      const tc = luminance[prevRow + x];
      const tr = luminance[prevRow + x + 1];
      const ml = luminance[rowOffset + x - 1];
      const mr = luminance[rowOffset + x + 1];
      const bl = luminance[nextRow + x - 1];
      const bc = luminance[nextRow + x];
      const br = luminance[nextRow + x + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      edges[rowOffset + x] = gx * gx + gy * gy;
    }
  }

  // Paper, then edge strokes (which may paint neighbours ahead of the scan)
  // and diagonal hatching in the darker tones.
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    // Running values of (x + y) % hatchingDensity and (x - y + height) % hatchingDensity.
    let hatchA = y % hatchingDensity;
    let hatchB = (height - y) % hatchingDensity;

    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const onHatchA = hatchA === 0;
      const onHatchB = hatchB === 0;
      if (++hatchA === hatchingDensity) hatchA = 0;
      if (++hatchB === hatchingDensity) hatchB = 0;

      let r = 250, g = 248, b = 245;

      const edgeSq = edges[rowOffset + x];
      if (edgeSq > edgeThresholdSq) {
        const edge = Math.sqrt(edgeSq);
        const darkness = edge * 2 > 255 ? 255 : edge * 2;
        const strokeVal = 255 - darkness;

        const pyEnd = Math.min(height - 1, y + halfThick);
        const pxStart = Math.max(0, x - halfThick);
        const pxEnd = Math.min(width - 1, x + halfThick);
        for (let py = Math.max(0, y - halfThick); py <= pyEnd; py++) {
          for (let px = pxStart; px <= pxEnd; px++) {
            const pIdx = (py * width + px) * 4;
            if (outputData[pIdx + 3] === 0 || outputData[pIdx] > strokeVal) {
              outputData[pIdx] = strokeVal;
              outputData[pIdx + 1] = strokeVal;
              outputData[pIdx + 2] = strokeVal;
              outputData[pIdx + 3] = 255;
            }
          }
        }
      }

      // Pixels already painted by a stroke keep it.
      if (outputData[idx + 3] === 0) {
        const lum = luminance[rowOffset + x] / 255;

        if (lum < 0.7 && onHatchA) {
          const hatchDarkness = ((1 - lum) * 100) | 0;
          r -= hatchDarkness;
          g -= hatchDarkness;
          b -= hatchDarkness;
        }
        if (lum < 0.4 && onHatchB) {
          const hatchDarkness = ((1 - lum) * 80) | 0;
          r -= hatchDarkness;
          g -= hatchDarkness;
          b -= hatchDarkness;
        }

        outputData[idx] = r < 0 ? 0 : r;
        outputData[idx + 1] = g < 0 ? 0 : g;
        outputData[idx + 2] = b < 0 ? 0 : b;
        outputData[idx + 3] = 255;
      }
    }
  }
}
