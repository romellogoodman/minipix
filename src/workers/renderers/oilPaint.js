import { randomNumber, map } from "../utils.js";

export default function oilPaint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const radius = Math.max(2, Math.round(minDim * map(random(), 0, 1, config.radiusPercent.min, config.radiusPercent.max)));
  const levels = randomNumber(config.levels.min, config.levels.max, random);
  const saturation = map(random(), 0, 1, config.saturation.min, config.saturation.max);

  // Endpoint-preserving quantization.
  const quantStep = 255 / (levels - 1);
  const invQuantStep = 1 / quantStep;

  // Define 4 quadrant bounds once (relative offsets)
  const quadrants = [
    { x0: -radius, x1: 0, y0: -radius, y1: 0 },
    { x0: 0, x1: radius, y0: -radius, y1: 0 },
    { x0: -radius, x1: 0, y0: 0, y1: radius },
    { x0: 0, x1: radius, y0: 0, y1: radius },
  ];

  // Kuwahara filter implementation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      let minVariance = Infinity;
      let bestR = 0, bestG = 0, bestB = 0;

      for (let q = 0; q < 4; q++) {
        const quad = quadrants[q];
        let sumR = 0, sumG = 0, sumB = 0;
        let sumR2 = 0, sumG2 = 0, sumB2 = 0;
        let count = 0;

        for (let qy = quad.y0; qy <= quad.y1; qy++) {
          const sy = y + qy;
          if (sy < 0 || sy >= height) continue;
          const rowOffset = sy * width;

          for (let qx = quad.x0; qx <= quad.x1; qx++) {
            const sx = x + qx;
            if (sx < 0 || sx >= width) continue;
            const sIdx = (rowOffset + sx) * 4;

            const r = imageData[sIdx];
            const g = imageData[sIdx + 1];
            const b = imageData[sIdx + 2];

            sumR += r; sumG += g; sumB += b;
            sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
            count++;
          }
        }

        if (count > 0) {
          const invCount = 1 / count;
          const avgR = sumR * invCount;
          const avgG = sumG * invCount;
          const avgB = sumB * invCount;
          const variance = (sumR2 * invCount - avgR * avgR) +
                          (sumG2 * invCount - avgG * avgG) +
                          (sumB2 * invCount - avgB * avgB);

          if (variance < minVariance) {
            minVariance = variance;
            bestR = Math.round(avgR * invQuantStep) * quantStep;
            bestG = Math.round(avgG * invQuantStep) * quantStep;
            bestB = Math.round(avgB * invQuantStep) * quantStep;
          }
        }
      }

      // Apply saturation boost
      const lum = 0.299 * bestR + 0.587 * bestG + 0.114 * bestB;
      let r = lum + (bestR - lum) * saturation;
      let g = lum + (bestG - lum) * saturation;
      let b = lum + (bestB - lum) * saturation;

      outputData[dstIdx] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
      outputData[dstIdx + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
      outputData[dstIdx + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      outputData[dstIdx + 3] = 255;
    }
  }
}
