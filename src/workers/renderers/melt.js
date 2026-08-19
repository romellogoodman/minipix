import { randFloat, randomNumber, createNoise2D } from "../utils.js";

export default function melt({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const scale = shortSide * randFloat(config.scalePercent, random);
  const baseFreq = randFloat(config.baseFrequency, random);
  const octaves = randomNumber(config.numOctaves.min, config.numOctaves.max, random);

  const noise = createNoise2D(random);

  // Geometric series sum for amplitude normalization — constant per render.
  let norm = 0;
  for (let o = 0, a = 1; o < octaves; o++, a *= 0.5) norm += a;
  const invNorm = 1 / norm;

  const fbm = (x, y) => {
    let sum = 0, amp = 1, freq = baseFreq;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum * invNorm;
  };

  // Use decorrelated offsets for the X and Y displacement fields so the
  // warp isn't constrained to a diagonal.
  const ox = random() * 1000;
  const oy = random() * 1000;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = fbm(x, y) * scale;
      const dy = fbm(x + ox, y + oy) * scale;

      const sx = Math.max(0, Math.min(width - 1, Math.round(x + dx)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(y + dy)));

      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      outputData[di] = imageData[si];
      outputData[di + 1] = imageData[si + 1];
      outputData[di + 2] = imageData[si + 2];
      outputData[di + 3] = 255;
    }
  }
}
