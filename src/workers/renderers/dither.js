import { randomNumber, extractDominantColors } from "../utils.js";

export default function dither({ imageData, width, height, config, random, outputData }) {
  const numColors = randomNumber(config.numColors.min, config.numColors.max, random);
  const palette = extractDominantColors({ data: imageData, width, height }, numColors);

  const modes = ["atkinson", "ordered", "blueNoise"];
  const mode = modes[Math.floor(random() * modes.length)];

  const numPal = palette.length;
  const palR = palette.map((c) => c.r);
  const palG = palette.map((c) => c.g);
  const palB = palette.map((c) => c.b);

  // Writes the nearest palette colour (first minimum by squared RGB distance) and returns its index.
  const putNearest = (idx, r, g, b) => {
    let minDist = Infinity;
    let best = 0;
    for (let p = 0; p < numPal; p++) {
      const dr = r - palR[p];
      const dg = g - palG[p];
      const db = b - palB[p];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        best = p;
      }
    }
    outputData[idx] = palR[best];
    outputData[idx + 1] = palG[best];
    outputData[idx + 2] = palB[best];
    outputData[idx + 3] = 255;
    return best;
  };

  // Adds a size×size threshold tile, repeated across the image, before quantizing.
  const tileThreshold = (thresholds, size) => {
    for (let y = 0, idx = 0; y < height; y++) {
      const rowBase = (y % size) * size;
      for (let x = 0, tx = 0; x < width; x++, idx += 4) {
        const t = thresholds[rowBase + tx];
        if (++tx === size) tx = 0;
        putNearest(idx, imageData[idx] + t, imageData[idx + 1] + t, imageData[idx + 2] + t);
      }
    }
  };

  if (mode === "atkinson") {
    const err = new Float32Array(width * height * 3);
    const row = width * 3;
    // Atkinson spreads 1/8 of the error to (x+1, y), (x+2, y), (x-1, y+1), (x, y+1), (x+1, y+1), (x, y+2).

    for (let y = 0; y < height; y++) {
      const has1 = y + 1 < height;
      const has2 = y + 2 < height;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const ei = (y * width + x) * 3;

        const r = imageData[idx] + err[ei];
        const g = imageData[idx + 1] + err[ei + 1];
        const b = imageData[idx + 2] + err[ei + 2];
        let minDist = Infinity;
        let c = 0;
        for (let p = 0; p < numPal; p++) {
          const dr = r - palR[p];
          const dg = g - palG[p];
          const db = b - palB[p];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) {
            minDist = dist;
            c = p;
          }
        }
        const cr = palR[c], cg = palG[c], cb = palB[c];
        outputData[idx] = cr;
        outputData[idx + 1] = cg;
        outputData[idx + 2] = cb;
        outputData[idx + 3] = 255;

        const eR = (r - cr) / 8, eG = (g - cg) / 8, eB = (b - cb) / 8;
        let ni;
        if (x + 1 < width) { ni = ei + 3; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB; }
        if (x + 2 < width) { ni = ei + 6; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB; }
        if (has1) {
          if (x > 0) { ni = ei + row - 3; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB; }
          ni = ei + row; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB;
          if (x + 1 < width) { ni = ei + row + 3; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB; }
        }
        if (has2) { ni = ei + 2 * row; err[ni] += eR; err[ni + 1] += eG; err[ni + 2] += eB; }
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

    const thresholds = new Float64Array(bayer.length);
    for (let i = 0; i < bayer.length; i++) thresholds[i] = (bayer[i] * scale - 0.5) * 128;
    tileThreshold(thresholds, bayerN);
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

    const thresholds = new Float64Array(noise.length);
    for (let i = 0; i < noise.length; i++) thresholds[i] = (noise[i] - 0.5) * 128;
    tileThreshold(thresholds, noiseSize);
  }
}
