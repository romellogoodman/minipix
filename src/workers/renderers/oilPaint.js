import { randomNumber, randFloat } from "../utils.js";

export default function oilPaint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const radius = Math.max(2, Math.round(minDim * randFloat(config.radiusPercent, random)));
  const levels = randomNumber(config.levels.min, config.levels.max, random);
  const saturation = randFloat(config.saturation, random);

  const quantStep = 255 / (levels - 1);
  const invQuantStep = 1 / quantStep;

  // Each quadrant's mean and variance comes from running sums of R/G/B and
  // R²/G²/B² (six channels interleaved): per-column sums over the rows above
  // (colTop, rows y-radius..y) and below (colBot, rows y..y+radius) slide down
  // one row at a time, and their per-row prefix sums give any column span in
  // 2 lookups. Every value is an integer well below 2^53, so the sums are exact.
  const colTop = new Float64Array(width * 6);
  const colBot = new Float64Array(width * 6);
  const preTop = new Float64Array((width + 1) * 6);
  const preBot = new Float64Array((width + 1) * 6);
  const addRow = (col, y, sign) => {
    for (let x = 0, si = y * width * 4, ci = 0; x < width; x++, si += 4, ci += 6) {
      const r = imageData[si], g = imageData[si + 1], b = imageData[si + 2];
      col[ci] += sign * r; col[ci + 1] += sign * g; col[ci + 2] += sign * b;
      col[ci + 3] += sign * (r * r); col[ci + 4] += sign * (g * g); col[ci + 5] += sign * (b * b);
    }
  };
  const prefix = (col, pre) => {
    for (let ci = 0; ci < width * 6; ci++) pre[ci + 6] = pre[ci] + col[ci];
  };
  for (let y = 0; y <= Math.min(height - 1, radius); y++) addRow(colBot, y, 1);
  const invN = new Float64Array((radius + 1) * (radius + 1) + 1);
  for (let n = 1; n < invN.length; n++) invN[n] = 1 / n;

  for (let y = 0; y < height; y++) {
    const ya = Math.max(0, y - radius), yb = Math.min(height - 1, y + radius);
    addRow(colTop, y, 1);
    if (y - radius - 1 >= 0) addRow(colTop, y - radius - 1, -1);
    if (y > 0) {
      addRow(colBot, y - 1, -1);
      if (y + radius < height) addRow(colBot, y + radius, 1);
    }
    prefix(colTop, preTop);
    prefix(colBot, preBot);
    const rowsTop = y - ya + 1, rowsBot = yb - y + 1;

    for (let x = 0; x < width; x++) {
      const xa = Math.max(0, x - radius), xb = Math.min(width - 1, x + radius);
      let minVariance = Infinity;
      let meanR = 0, meanG = 0, meanB = 0;

      // Quadrants in order: top-left, top-right, bottom-left, bottom-right.
      for (let q = 0; q < 4; q++) {
        const x0 = q & 1 ? x : xa, x1 = q & 1 ? xb : x;
        const pre = q & 2 ? preBot : preTop;
        const n = (x1 - x0 + 1) * (q & 2 ? rowsBot : rowsTop);
        const inv = invN[n];
        const a = (x1 + 1) * 6, c = x0 * 6;

        const mR = (pre[a] - pre[c]) * inv;
        const mG = (pre[a + 1] - pre[c + 1]) * inv;
        const mB = (pre[a + 2] - pre[c + 2]) * inv;
        const vR = (pre[a + 3] - pre[c + 3]) * inv - mR * mR;
        const vG = (pre[a + 4] - pre[c + 4]) * inv - mG * mG;
        const vB = (pre[a + 5] - pre[c + 5]) * inv - mB * mB;
        const variance = vR + vG + vB;

        if (variance < minVariance) {
          minVariance = variance;
          meanR = mR; meanG = mG; meanB = mB;
        }
      }

      const bestR = Math.round(meanR * invQuantStep) * quantStep;
      const bestG = Math.round(meanG * invQuantStep) * quantStep;
      const bestB = Math.round(meanB * invQuantStep) * quantStep;

      const lum = 0.299 * bestR + 0.587 * bestG + 0.114 * bestB;
      const di = (y * width + x) * 4;
      outputData[di] = lum + (bestR - lum) * saturation;
      outputData[di + 1] = lum + (bestG - lum) * saturation;
      outputData[di + 2] = lum + (bestB - lum) * saturation;
      outputData[di + 3] = 255;
    }
  }
}
