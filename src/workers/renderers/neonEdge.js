import { randomNumber, randFloat } from "../utils.js";

const NEON = [
  [255, 20, 147],
  [0, 255, 255],
  [57, 255, 20],
  [255, 255, 0],
  [191, 0, 255],
  [255, 110, 0],
];

export default function neonEdge({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const darken = randFloat(config.darken, random);
  const glowRadius = randomNumber(config.glowRadius.min, config.glowRadius.max, random);
  const numHues = randomNumber(config.numHues.min, config.numHues.max, random);

  // Distinct hues via partial Fisher-Yates
  const pool = NEON.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hues = pool.slice(0, numHues);

  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < imageData.length; i += 4, p++) {
    lum[p] = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
  }

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

  // Separable box blur with clamped sampling (no border dimming).
  const tmp = new Float32Array(width * height * 3);
  const glow = new Float32Array(width * height * 3);
  const win = glowRadius * 2 + 1;
  const inv = 1 / win;
  const clamp = (v, max) => (v < 0 ? 0 : v >= max ? max - 1 : v);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let dx = -glowRadius; dx <= glowRadius; dx++) {
        const ni = (y * width + clamp(x + dx, width)) * 3;
        sr += edge[ni]; sg += edge[ni + 1]; sb += edge[ni + 2];
      }
      const i = (y * width + x) * 3;
      tmp[i] = sr * inv; tmp[i + 1] = sg * inv; tmp[i + 2] = sb * inv;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let dy = -glowRadius; dy <= glowRadius; dy++) {
        const ni = (clamp(y + dy, height) * width + x) * 3;
        sr += tmp[ni]; sg += tmp[ni + 1]; sb += tmp[ni + 2];
      }
      const i = (y * width + x) * 3;
      glow[i] = sr * inv; glow[i + 1] = sg * inv; glow[i + 2] = sb * inv;
    }
  }

  for (let p = 0; p < width * height; p++) {
    const i = p * 4, e = p * 3;
    outputData[i] = Math.min(255, imageData[i] * darken + edge[e] + glow[e] * 2);
    outputData[i + 1] = Math.min(255, imageData[i + 1] * darken + edge[e + 1] + glow[e + 1] * 2);
    outputData[i + 2] = Math.min(255, imageData[i + 2] * darken + edge[e + 2] + glow[e + 2] * 2);
    outputData[i + 3] = 255;
  }
}
