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
  const isEdge = new Uint8Array(width * height);
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
        isEdge[p] = 1;
      }
    }
  }

  // Separable box blur with clamped sampling (no border dimming).
  const tmp = new Float32Array(width * height * 3);
  const glow = new Float32Array(width * height * 3);
  const win = glowRadius * 2 + 1;
  const inv = 1 / win;
  const maxX = width - 1;
  const maxY = height - 1;

  // Edges are sparse: windows with no edge pixel sum to exactly 0, so they
  // are skipped (tmp/glow start zeroed). Integer counts track the windows.
  const nearEdge = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let k = -glowRadius; k <= glowRadius; k++) count += isEdge[row + (k < 0 ? 0 : k > maxX ? maxX : k)];
    for (let x = 0; x < width; x++) {
      if (count > 0) {
        nearEdge[row + x] = 1;
        let sr = 0, sg = 0, sb = 0;
        if (x >= glowRadius && x + glowRadius <= maxX) {
          const end = (row + x + glowRadius) * 3;
          for (let ni = (row + x - glowRadius) * 3; ni <= end; ni += 3) {
            sr += edge[ni]; sg += edge[ni + 1]; sb += edge[ni + 2];
          }
        } else {
          for (let dx = -glowRadius; dx <= glowRadius; dx++) {
            const sx = x + dx;
            const ni = (row + (sx < 0 ? 0 : sx > maxX ? maxX : sx)) * 3;
            sr += edge[ni]; sg += edge[ni + 1]; sb += edge[ni + 2];
          }
        }
        const i = (row + x) * 3;
        tmp[i] = sr * inv; tmp[i + 1] = sg * inv; tmp[i + 2] = sb * inv;
      }
      const add = x + glowRadius + 1;
      const sub = x - glowRadius;
      count += isEdge[row + (add > maxX ? maxX : add)] - isEdge[row + (sub < 0 ? 0 : sub)];
    }
  }
  const rowLen = width * 3;
  const taps = new Int32Array(win);
  const colCount = new Int32Array(width);
  for (let k = -glowRadius; k <= glowRadius; k++) {
    const row = (k < 0 ? 0 : k > maxY ? maxY : k) * width;
    for (let x = 0; x < width; x++) colCount[x] += nearEdge[row + x];
  }
  for (let y = 0; y < height; y++) {
    for (let k = 0; k < win; k++) {
      const sy = y + k - glowRadius;
      taps[k] = (sy < 0 ? 0 : sy > maxY ? maxY : sy) * rowLen;
    }
    const out = y * rowLen;
    for (let x = 0; x < width; x++) {
      if (colCount[x] === 0) continue;
      for (let j = x * 3, jEnd = j + 3; j < jEnd; j++) {
        let sum = 0;
        for (let k = 0; k < win; k++) sum += tmp[taps[k] + j];
        glow[out + j] = sum * inv;
      }
    }
    const add = (y + glowRadius + 1 > maxY ? maxY : y + glowRadius + 1) * width;
    const sub = (y - glowRadius < 0 ? 0 : y - glowRadius) * width;
    for (let x = 0; x < width; x++) colCount[x] += nearEdge[add + x] - nearEdge[sub + x];
  }

  for (let p = 0; p < width * height; p++) {
    const i = p * 4, e = p * 3;
    outputData[i] = Math.min(255, imageData[i] * darken + edge[e] + glow[e] * 2);
    outputData[i + 1] = Math.min(255, imageData[i + 1] * darken + edge[e + 1] + glow[e + 1] * 2);
    outputData[i + 2] = Math.min(255, imageData[i + 2] * darken + edge[e + 2] + glow[e + 2] * 2);
    outputData[i + 3] = 255;
  }
}
