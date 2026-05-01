import { randomNumber, randFloat } from "../utils.js";

const NEON = [
  [255, 20, 147],   // deep pink
  [0, 255, 255],    // cyan
  [57, 255, 20],    // neon green
  [255, 255, 0],    // yellow
  [191, 0, 255],    // violet
  [255, 110, 0],    // orange
];

export default function neonEdge({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const darken = randFloat(config.darken, random);
  const glowRadius = randomNumber(config.glowRadius.min, config.glowRadius.max, random);
  const numHues = randomNumber(config.numHues.min, config.numHues.max, random);

  const hues = [];
  for (let i = 0; i < numHues; i++) hues.push(NEON[Math.floor(random() * NEON.length)]);

  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < imageData.length; i += 4, p++) {
    lum[p] = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
  }

  // Sobel → edge map with hue assignment by angle bucket
  const edge = new Float32Array(width * height * 3);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const tl = lum[p - width - 1], t = lum[p - width], tr = lum[p - width + 1];
      const l = lum[p - 1], r = lum[p + 1];
      const bl = lum[p + width - 1], b = lum[p + width], br = lum[p + width + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy) / 1020;
      if (mag > threshold) {
        const angle = (Math.atan2(gy, gx) + Math.PI) / (Math.PI * 2);
        const hue = hues[Math.floor(angle * numHues) % numHues];
        edge[p * 3] = hue[0] * mag;
        edge[p * 3 + 1] = hue[1] * mag;
        edge[p * 3 + 2] = hue[2] * mag;
      }
    }
  }

  // Box-blur the edge map for glow
  const glow = new Float32Array(width * height * 3);
  const norm = 1 / ((glowRadius * 2 + 1) ** 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gr = 0, gg = 0, gb = 0;
      for (let dy = -glowRadius; dy <= glowRadius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -glowRadius; dx <= glowRadius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const ni = (ny * width + nx) * 3;
          gr += edge[ni]; gg += edge[ni + 1]; gb += edge[ni + 2];
        }
      }
      const gi = (y * width + x) * 3;
      glow[gi] = gr * norm; glow[gi + 1] = gg * norm; glow[gi + 2] = gb * norm;
    }
  }

  // Composite: darkened original + edge core + glow (additive)
  for (let p = 0; p < width * height; p++) {
    const i = p * 4, e = p * 3;
    outputData[i] = Math.min(255, imageData[i] * darken + edge[e] + glow[e] * 2);
    outputData[i + 1] = Math.min(255, imageData[i + 1] * darken + edge[e + 1] + glow[e + 1] * 2);
    outputData[i + 2] = Math.min(255, imageData[i + 2] * darken + edge[e + 2] + glow[e + 2] * 2);
    outputData[i + 3] = 255;
  }
}
