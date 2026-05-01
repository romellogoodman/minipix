import { randomNumber, extractDominantColors, findNearestColor } from "../utils.js";

export default function dither({ imageData, width, height, config, random, outputData }) {
  const numColors = randomNumber(config.numColors.min, config.numColors.max, random);
  const palette = extractDominantColors({ data: imageData, width, height }, numColors);

  const modes = ["atkinson", "ordered", "blueNoise"];
  const mode = modes[Math.floor(random() * modes.length)];

  const putNearest = (idx, r, g, b) => {
    const c = findNearestColor({ r, g, b }, palette);
    outputData[idx] = c.r;
    outputData[idx + 1] = c.g;
    outputData[idx + 2] = c.b;
    outputData[idx + 3] = 255;
    return c;
  };

  if (mode === "atkinson") {
    const err = new Float32Array(width * height * 3);
    const OFF = [1, 0, 2, 0, -1, 1, 0, 1, 1, 1, 0, 2];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const ei = (y * width + x) * 3;

        const r = imageData[idx] + err[ei];
        const g = imageData[idx + 1] + err[ei + 1];
        const b = imageData[idx + 2] + err[ei + 2];
        const c = putNearest(idx, r, g, b);

        const eR = (r - c.r) / 8, eG = (g - c.g) / 8, eB = (b - c.b) / 8;
        for (let o = 0; o < 12; o += 2) {
          const nx = x + OFF[o], ny = y + OFF[o + 1];
          if (nx >= 0 && nx < width && ny < height) {
            const ni = (ny * width + nx) * 3;
            err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB;
          }
        }
      }
    }
  } else if (mode === "ordered") {
    const bayerN = 1 << randomNumber(config.bayerSize.min, config.bayerSize.max, random);
    const buildBayer = (size) => {
      const m = new Float32Array(size * size);
      if (size === 2) { m[0] = 0; m[1] = 2; m[2] = 3; m[3] = 1; return m; }
      const half = size >> 1;
      const sub = buildBayer(half);
      const quad = [0, 2, 3, 1];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const q = (y < half ? 0 : 1) * 2 + (x < half ? 0 : 1);
          m[y * size + x] = 4 * sub[(y % half) * half + (x % half)] + quad[q];
        }
      }
      return m;
    };
    const bayer = buildBayer(bayerN);
    const scale = 1 / (bayerN * bayerN);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const t = (bayer[(y % bayerN) * bayerN + (x % bayerN)] * scale - 0.5) * 128;
        putNearest(idx, imageData[idx] + t, imageData[idx + 1] + t, imageData[idx + 2] + t);
      }
    }
  } else {
    const noiseSize = randomNumber(config.blueNoiseScale.min, config.blueNoiseScale.max, random);
    const noise = new Float32Array(noiseSize * noiseSize);
    for (let i = 0; i < noise.length; i++) noise[i] = random();

    // Void-and-cluster approximation: push each cell away from its 5×5 neighbor mean.
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < noiseSize; y++) {
        for (let x = 0; x < noiseSize; x++) {
          let sum = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = ((x + dx) % noiseSize + noiseSize) % noiseSize;
              const ny = ((y + dy) % noiseSize + noiseSize) % noiseSize;
              sum += noise[ny * noiseSize + nx];
            }
          }
          const i = y * noiseSize + x;
          noise[i] = Math.max(0, Math.min(1, noise[i] + (noise[i] - sum / 24) * 0.3));
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const t = (noise[(y % noiseSize) * noiseSize + (x % noiseSize)] - 0.5) * 128;
        putNearest(idx, imageData[idx] + t, imageData[idx + 1] + t, imageData[idx + 2] + t);
      }
    }
  }
}
