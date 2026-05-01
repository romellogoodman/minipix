import { randFloat, randomNumber } from "../utils.js";

// 2D gradient noise (Perlin-style) with a seeded permutation table.
function makeNoise(random) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (hash, x, y) => {
    switch (hash & 7) {
      case 0: return  x + y;
      case 1: return -x + y;
      case 2: return  x - y;
      case 3: return -x - y;
      case 4: return  x;
      case 5: return -x;
      case 6: return  y;
      default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const xf = x - fx;
    const yf = y - fy;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}

export default function melt({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const scale = shortSide * randFloat(config.scalePercent, random);
  const baseFreq = randFloat(config.baseFrequency, random);
  const octaves = randomNumber(config.numOctaves.min, config.numOctaves.max, random);

  const noise = makeNoise(random);

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
