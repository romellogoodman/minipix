import { randInt, randomNumber, randFloat } from "../utils.js";

export default function filmGrain({ imageData, width, height, config, random, outputData }) {
  const grainIntensity = randFloat(config.grainIntensity, random);
  const tintStrength = randFloat(config.tintStrength, random);
  const contrast = randFloat(config.contrast, random);
  const vignetteStrength = randFloat(config.vignette, random);
  const scratchCount = randInt(config.scratchCount, random);

  // Colour-matrix tints: sepia, cool blue, warm yellow, faded green.
  const tintType = Math.floor(random() * 4);
  const tints = [
    { r: [0.393, 0.769, 0.189], g: [0.349, 0.686, 0.168], b: [0.272, 0.534, 0.131] },
    { r: [0.3, 0.4, 0.5], g: [0.35, 0.5, 0.6], b: [0.4, 0.55, 0.7] },
    { r: [0.5, 0.6, 0.2], g: [0.45, 0.55, 0.18], b: [0.3, 0.4, 0.15] },
    { r: [0.35, 0.6, 0.3], g: [0.4, 0.65, 0.35], b: [0.32, 0.5, 0.28] },
  ];
  const tint = tints[tintType];

  // Scratches are vertical, so bake their brightness per column once.
  const scratchMap = new Float32Array(width);
  for (let i = 0; i < scratchCount; i++) {
    const scratchX = Math.floor(random() * width);
    const thickness = randomNumber(1, 3, random);
    const brightness = random() < 0.5 ? 40 + random() * 40 : -(20 + random() * 30);
    for (let dx = -thickness; dx < thickness; dx++) {
      const x = scratchX + dx;
      if (x >= 0 && x < width) scratchMap[x] += brightness;
    }
  }

  // Per-pixel grain comes from an inline xorshift32* stream seeded once from
  // the render RNG: one 32-bit draw gives three 10-bit grain values.
  let s = (random() * 4294967296) | 0 || 1;
  const grainScale = 255 * grainIntensity;
  const grainLUT = new Float32Array(1024);
  for (let k = 0; k < 1024; k++) grainLUT[k] = ((k + 0.5) / 1024 - 0.5) * grainScale;

  // Contrast then tint is one affine map: out = M·rgb + c.
  const t = tintStrength, k = 1 - t;
  const row = (m, ch) => [
    (k * (ch === 0) + t * m[0]) * contrast,
    (k * (ch === 1) + t * m[1]) * contrast,
    (k * (ch === 2) + t * m[2]) * contrast,
  ];
  const off = 128 * (1 - contrast);
  const [m00, m01, m02] = row(tint.r, 0);
  const [m10, m11, m12] = row(tint.g, 1);
  const [m20, m21, m22] = row(tint.b, 2);
  const c0 = off * (m00 + m01 + m02) / contrast, c1 = off * (m10 + m11 + m12) / contrast, c2 = off * (m20 + m21 + m22) / contrast;

  const vignetteMultiplier = vignetteStrength * 0.5;
  const invWidth = 2 / width;
  const invHeight = 2 / height;
  // Squared falloff, separable into a column term and a row term.
  const vigX = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const vx = x * invWidth - 1;
    vigX[x] = vx * vx * vignetteMultiplier;
  }

  // Opaque pixels written as little-endian RGBA words.
  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, width * height);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  for (let y = 0; y < height; y++) {
    const vy = y * invHeight - 1;
    const rowVig = 1 - vy * vy * vignetteMultiplier;
    let i = y * width * 4;

    for (let x = 0, p = y * width; x < width; x++, p++, i += 4) {
      const r0 = imageData[i], g0 = imageData[i + 1], b0 = imageData[i + 2];

      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v = Math.imul(s, 0x2545f491) >>> 0;

      const vignette = rowVig - vigX[x];
      const scratch = scratchMap[x];
      const r = clamp(((m00 * r0 + m01 * g0 + m02 * b0 + c0 + grainLUT[v >>> 22]) * vignette + scratch) | 0);
      const g = clamp(((m10 * r0 + m11 * g0 + m12 * b0 + c1 + grainLUT[(v >>> 12) & 1023]) * vignette + scratch) | 0);
      const b = clamp(((m20 * r0 + m21 * g0 + m22 * b0 + c2 + grainLUT[(v >>> 2) & 1023]) * vignette + scratch) | 0);
      out32[p] = -16777216 | (b << 16) | (g << 8) | r;
    }
  }
}
