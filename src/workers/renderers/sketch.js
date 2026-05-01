import { randomNumber } from "../utils.js";

export default function sketch({ imageData, width, height, config, random, outputData }) {

  const lineThickness = randomNumber(config.lineThickness.min, config.lineThickness.max, random);
  const edgeThreshold = randomNumber(config.edgeThreshold.min, config.edgeThreshold.max, random);
  const hatchingDensity = randomNumber(config.hatchingDensity.min, config.hatchingDensity.max, random);

  // Pre-compute luminance for the entire image (avoids recalculating per pixel)
  const luminance = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    luminance[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) | 0;
  }

  // First pass: Sobel edge detection using pre-computed luminance.
  // Squared magnitude can reach ~2.08M, so Uint16 would overflow.
  const edges = new Uint32Array(width * height);
  const edgeThresholdSq = edgeThreshold * edgeThreshold;
  const halfThick = lineThickness >> 1;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      // Unrolled Sobel kernel (faster than nested loops)
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

      // Store squared magnitude (avoid sqrt until needed)
      edges[rowOffset + x] = gx * gx + gy * gy;
    }
  }

  // Fill with paper color and apply effects in single pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;

      // Start with paper color
      let r = 250, g = 248, b = 245;

      // Check edge (compare squared values to avoid sqrt)
      const edgeSq = edges[rowOffset + x];
      if (edgeSq > edgeThresholdSq) {
        // Draw edge - use sqrt only when we need actual magnitude for darkness
        const edge = Math.sqrt(edgeSq);
        const darkness = edge * 2 > 255 ? 255 : edge * 2;
        const strokeVal = 255 - darkness;

        // Apply stroke to surrounding pixels based on thickness
        for (let dy = -halfThick; dy <= halfThick; dy++) {
          const py = y + dy;
          if (py < 0 || py >= height) continue;
          for (let dx = -halfThick; dx <= halfThick; dx++) {
            const px = x + dx;
            if (px < 0 || px >= width) continue;
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

      // Only set pixel if not already set by an edge stroke
      if (outputData[idx + 3] === 0) {
        const lum = luminance[rowOffset + x] / 255;

        // Apply hatching based on luminance
        if (lum < 0.7 && (x + y) % hatchingDensity === 0) {
          const hatchDarkness = ((1 - lum) * 100) | 0;
          r -= hatchDarkness;
          g -= hatchDarkness;
          b -= hatchDarkness;
        }
        if (lum < 0.4 && (x - y + height) % hatchingDensity === 0) {
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
