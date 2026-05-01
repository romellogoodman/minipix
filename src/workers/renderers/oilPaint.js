import { randomNumber, randFloat } from "../utils.js";

export default function oilPaint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const radius = Math.max(2, Math.round(minDim * randFloat(config.radiusPercent, random)));
  const levels = randomNumber(config.levels.min, config.levels.max, random);
  const saturation = randFloat(config.saturation, random);

  const quantStep = 255 / (levels - 1);
  const invQuantStep = 1 / quantStep;

  // Summed-area tables for R/G/B and R²/G²/B² so each quadrant's mean and
  // variance is 4 lookups instead of (r+1)² samples.
  const W = width + 1, H = height + 1;
  const sat = [
    new Float64Array(W * H), new Float64Array(W * H), new Float64Array(W * H),
    new Float64Array(W * H), new Float64Array(W * H), new Float64Array(W * H),
  ];
  for (let y = 1; y < H; y++) {
    let row = [0, 0, 0, 0, 0, 0];
    for (let x = 1; x < W; x++) {
      const si = ((y - 1) * width + (x - 1)) * 4;
      const r = imageData[si], g = imageData[si + 1], b = imageData[si + 2];
      row[0] += r; row[1] += g; row[2] += b;
      row[3] += r * r; row[4] += g * g; row[5] += b * b;
      const i = y * W + x, up = (y - 1) * W + x;
      for (let c = 0; c < 6; c++) sat[c][i] = sat[c][up] + row[c];
    }
  }

  // Sum over [x0..x1]×[y0..y1] inclusive.
  const rectSum = (c, x0, y0, x1, y1) => {
    const s = sat[c];
    return s[(y1 + 1) * W + x1 + 1] - s[y0 * W + x1 + 1] - s[(y1 + 1) * W + x0] + s[y0 * W + x0];
  };

  const quadrants = [
    [-radius, 0, -radius, 0],
    [0, radius, -radius, 0],
    [-radius, 0, 0, radius],
    [0, radius, 0, radius],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minVariance = Infinity;
      let bestR = 0, bestG = 0, bestB = 0;

      for (let q = 0; q < 4; q++) {
        const [dx0, dx1, dy0, dy1] = quadrants[q];
        const x0 = Math.max(0, x + dx0), x1 = Math.min(width - 1, x + dx1);
        const y0 = Math.max(0, y + dy0), y1 = Math.min(height - 1, y + dy1);
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const inv = 1 / n;

        const mR = rectSum(0, x0, y0, x1, y1) * inv;
        const mG = rectSum(1, x0, y0, x1, y1) * inv;
        const mB = rectSum(2, x0, y0, x1, y1) * inv;
        const vR = rectSum(3, x0, y0, x1, y1) * inv - mR * mR;
        const vG = rectSum(4, x0, y0, x1, y1) * inv - mG * mG;
        const vB = rectSum(5, x0, y0, x1, y1) * inv - mB * mB;
        const variance = vR + vG + vB;

        if (variance < minVariance) {
          minVariance = variance;
          bestR = Math.round(mR * invQuantStep) * quantStep;
          bestG = Math.round(mG * invQuantStep) * quantStep;
          bestB = Math.round(mB * invQuantStep) * quantStep;
        }
      }

      const lum = 0.299 * bestR + 0.587 * bestG + 0.114 * bestB;
      const di = (y * width + x) * 4;
      outputData[di] = lum + (bestR - lum) * saturation;
      outputData[di + 1] = lum + (bestG - lum) * saturation;
      outputData[di + 2] = lum + (bestB - lum) * saturation;
      outputData[di + 3] = 255;
    }
  }
}
