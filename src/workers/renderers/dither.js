import { createSeededRandom, randomNumber } from "../utils.js";

export default function dither(imageData, width, height, config, seed) {
  const random = createSeededRandom(seed);
  const outputData = new Uint8ClampedArray(imageData.length);

  const numColors = randomNumber(config.numColors.min, config.numColors.max, random);

  // Extract a palette using k-means-style sampling
  const palette = [];
  const sampleStep = Math.max(1, Math.floor(imageData.length / 4 / 1000));
  const samples = [];
  for (let i = 0; i < imageData.length; i += sampleStep * 4) {
    samples.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
  }
  // Initialize centroids from random samples
  for (let i = 0; i < numColors; i++) {
    const idx = Math.floor(random() * samples.length);
    palette.push([...samples[idx]]);
  }
  // Run k-means for a few iterations
  for (let iter = 0; iter < 5; iter++) {
    const sums = palette.map(() => [0, 0, 0]);
    const counts = new Array(palette.length).fill(0);
    for (const sample of samples) {
      let minDist = Infinity;
      let best = 0;
      for (let p = 0; p < palette.length; p++) {
        const dr = sample[0] - palette[p][0];
        const dg = sample[1] - palette[p][1];
        const db = sample[2] - palette[p][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) { minDist = dist; best = p; }
      }
      sums[best][0] += sample[0];
      sums[best][1] += sample[1];
      sums[best][2] += sample[2];
      counts[best]++;
    }
    for (let p = 0; p < palette.length; p++) {
      if (counts[p] > 0) {
        palette[p][0] = sums[p][0] / counts[p];
        palette[p][1] = sums[p][1] / counts[p];
        palette[p][2] = sums[p][2] / counts[p];
      }
    }
  }

  const findNearest = (r, g, b) => {
    let minDist = Infinity;
    let best = 0;
    for (let p = 0; p < palette.length; p++) {
      const dr = r - palette[p][0];
      const dg = g - palette[p][1];
      const db = b - palette[p][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) { minDist = dist; best = p; }
    }
    return best;
  };

  // Pick dithering mode
  const modes = ["atkinson", "ordered", "blueNoise"];
  const mode = modes[Math.floor(random() * modes.length)];

  if (mode === "atkinson") {
    // Atkinson dithering - diffuses 3/4 of error for sharper results
    const errR = new Float32Array(width * height);
    const errG = new Float32Array(width * height);
    const errB = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const pixIdx = y * width + x;

        const r = Math.max(0, Math.min(255, imageData[idx] + errR[pixIdx]));
        const g = Math.max(0, Math.min(255, imageData[idx + 1] + errG[pixIdx]));
        const b = Math.max(0, Math.min(255, imageData[idx + 2] + errB[pixIdx]));

        const best = findNearest(r, g, b);
        outputData[idx] = palette[best][0];
        outputData[idx + 1] = palette[best][1];
        outputData[idx + 2] = palette[best][2];
        outputData[idx + 3] = 255;

        // Atkinson diffuses 1/8 of error to 6 neighbors (total 6/8 = 3/4)
        const eR = (r - palette[best][0]) / 8;
        const eG = (g - palette[best][1]) / 8;
        const eB = (b - palette[best][2]) / 8;

        const offsets = [
          [1, 0], [2, 0],
          [-1, 1], [0, 1], [1, 1],
          [0, 2],
        ];
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny < height) {
            const nIdx = ny * width + nx;
            errR[nIdx] += eR;
            errG[nIdx] += eG;
            errB[nIdx] += eB;
          }
        }
      }
    }
  } else if (mode === "ordered") {
    // Ordered dithering with configurable Bayer matrix size
    const bayerExp = randomNumber(config.bayerSize.min, config.bayerSize.max, random);
    const bayerN = 1 << bayerExp; // 8 or 16

    // Generate Bayer matrix recursively
    const bayerMatrix = new Float32Array(bayerN * bayerN);
    const buildBayer = (size) => {
      const matrix = new Float32Array(size * size);
      if (size === 2) {
        matrix[0] = 0; matrix[1] = 2;
        matrix[2] = 3; matrix[3] = 1;
        return matrix;
      }
      const half = size >> 1;
      const sub = buildBayer(half);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const subVal = sub[(y % half) * half + (x % half)];
          const quadrant = (y < half ? 0 : 1) * 2 + (x < half ? 0 : 1);
          const offsets = [0, 2, 3, 1];
          matrix[y * size + x] = 4 * subVal + offsets[quadrant];
        }
      }
      return matrix;
    };
    const bayer = buildBayer(bayerN);
    const bayerScale = 1 / (bayerN * bayerN);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const threshold = (bayer[(y % bayerN) * bayerN + (x % bayerN)] * bayerScale - 0.5) * 128;

        const r = Math.max(0, Math.min(255, imageData[idx] + threshold));
        const g = Math.max(0, Math.min(255, imageData[idx + 1] + threshold));
        const b = Math.max(0, Math.min(255, imageData[idx + 2] + threshold));

        const best = findNearest(r, g, b);
        outputData[idx] = palette[best][0];
        outputData[idx + 1] = palette[best][1];
        outputData[idx + 2] = palette[best][2];
        outputData[idx + 3] = 255;
      }
    }
  } else {
    // Blue noise dithering - organic, non-repetitive pattern
    const scale = randomNumber(config.blueNoiseScale.min, config.blueNoiseScale.max, random);

    // Generate blue noise texture using void-and-cluster approximation
    const noiseSize = scale;
    const noise = new Float32Array(noiseSize * noiseSize);

    // Initialize with random values
    for (let i = 0; i < noise.length; i++) {
      noise[i] = random();
    }

    // Apply several passes of local energy minimization to approximate blue noise
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < noiseSize; y++) {
        for (let x = 0; x < noiseSize; x++) {
          let sum = 0;
          let count = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = ((x + dx) % noiseSize + noiseSize) % noiseSize;
              const ny = ((y + dy) % noiseSize + noiseSize) % noiseSize;
              sum += noise[ny * noiseSize + nx];
              count++;
            }
          }
          const avg = sum / count;
          const current = noise[y * noiseSize + x];
          // Push away from neighbors' average
          noise[y * noiseSize + x] = current + (current - avg) * 0.3;
          // Re-normalize to 0-1
          if (noise[y * noiseSize + x] < 0) noise[y * noiseSize + x] = 0;
          if (noise[y * noiseSize + x] > 1) noise[y * noiseSize + x] = 1;
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const threshold = (noise[(y % noiseSize) * noiseSize + (x % noiseSize)] - 0.5) * 128;

        const r = Math.max(0, Math.min(255, imageData[idx] + threshold));
        const g = Math.max(0, Math.min(255, imageData[idx + 1] + threshold));
        const b = Math.max(0, Math.min(255, imageData[idx + 2] + threshold));

        const best = findNearest(r, g, b);
        outputData[idx] = palette[best][0];
        outputData[idx + 1] = palette[best][1];
        outputData[idx + 2] = palette[best][2];
        outputData[idx + 3] = 255;
      }
    }
  }

  return outputData;
}
