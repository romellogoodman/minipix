import { randInt, randFloat, createNoise2D, catmullRomWeights } from "../utils.js";

export default function melt({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const scale = shortSide * randFloat(config.scalePercent, random);
  const baseFreq = randFloat(config.baseFrequency, random);
  const octaves = randInt(config.numOctaves, random);

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

  // The displacement field is smooth, so it's evaluated exactly every STEP px
  // and Catmull-Rom interpolated in between (separably: grid rows are
  // upsampled along x as they're needed, then each output row blends four).
  // Grid spacing: at least ~3 nodes per noise cell of the finest octave, capped at 4 px
  // (beyond that the per-pixel pass dominates anyway).
  const topFreq = baseFreq * 2 ** (octaves - 1);
  const STEP = Math.max(1, Math.min(4, Math.floor(0.3 / topFreq)));

  // Grid node i sits at x = (i - 1) * STEP (one node of padding each side).
  const gw = Math.floor((width - 1) / STEP) + 4;

  // Per-x tap weights (they only depend on x % STEP) and base node.
  const wx = new Float64Array(STEP * 4);
  for (let r = 0; r < STEP; r++) catmullRomWeights(r / STEP, wx, r * 4);

  // Ring of 4 grid rows upsampled to full width, keyed by grid row.
  const ringX = [0, 1, 2, 3].map(() => new Float64Array(width));
  const ringY = [0, 1, 2, 3].map(() => new Float64Array(width));
  const ringRow = new Int32Array(4).fill(-1);
  const nodeX = new Float64Array(gw);
  const nodeY = new Float64Array(gw);
  const upsampleRow = (j) => {
    const slot = j & 3;
    if (ringRow[slot] === j) return;
    ringRow[slot] = j;
    const y = (j - 1) * STEP;
    for (let i = 0; i < gw; i++) {
      const x = (i - 1) * STEP;
      nodeX[i] = fbm(x, y) * scale;
      nodeY[i] = fbm(x + ox, y + oy) * scale;
    }
    const outX = ringX[slot], outY = ringY[slot];
    for (let x = 0; x < width; x++) {
      const i = (x / STEP) | 0; // nodes i .. i + 3 surround x
      const w = (x - i * STEP) * 4;
      const w0 = wx[w], w1 = wx[w + 1], w2 = wx[w + 2], w3 = wx[w + 3];
      outX[x] = nodeX[i] * w0 + nodeX[i + 1] * w1 + nodeX[i + 2] * w2 + nodeX[i + 3] * w3;
      outY[x] = nodeY[i] * w0 + nodeY[i + 1] * w1 + nodeY[i + 2] * w2 + nodeY[i + 3] * w3;
    }
  };

  // One little-endian RGBA word per pixel.
  const src32 = imageData.byteOffset % 4 === 0
    ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
    : new Uint32Array(imageData.slice().buffer, 0, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const wy = new Float64Array(4);
  const maxX = width - 1, maxY = height - 1;
  let di = 0;
  for (let y = 0; y < height; y++) {
    const j = (y / STEP) | 0;
    for (let k = 0; k < 4; k++) upsampleRow(j + k);
    catmullRomWeights((y - j * STEP) / STEP, wy, 0);
    const w0 = wy[0], w1 = wy[1], w2 = wy[2], w3 = wy[3];
    const ax = ringX[j & 3], bx = ringX[(j + 1) & 3], cx = ringX[(j + 2) & 3], ex = ringX[(j + 3) & 3];
    const ay = ringY[j & 3], by = ringY[(j + 1) & 3], cy = ringY[(j + 2) & 3], ey = ringY[(j + 3) & 3];
    for (let x = 0; x < width; x++, di++) {
      const dx = ax[x] * w0 + bx[x] * w1 + cx[x] * w2 + ex[x] * w3;
      const dy = ay[x] * w0 + by[x] * w1 + cy[x] * w2 + ey[x] * w3;

      // Same as clamped Math.round, without the slow call: floor(v + 0.5),
      // and truncation is floor once clamped to ≥ 0.
      let fx = x + 0.5 + dx;
      let fy = y + 0.5 + dy;
      fx = fx < 0 ? 0 : fx > maxX ? maxX : fx;
      fy = fy < 0 ? 0 : fy > maxY ? maxY : fy;
      const sx = fx | 0, sy = fy | 0;

      out32[di] = src32[sy * width + sx] | 0xff000000;
    }
  }
}
