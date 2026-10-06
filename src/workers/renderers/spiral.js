import { randFloat } from "../utils.js";

export default function spiral({ imageData, width, height, config, random, outputData }) {
  const spiralStrength = randFloat(config.spiralStrength, random);
  const useOscillation = random() < config.oscillationProbability;
  const direction = random() < 0.5 ? 1 : -1;

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  // Normalize frequency so ring count is resolution-independent.
  const oscillationFrequency = randFloat(config.oscillationFrequency, random) * (1000 / maxRadius);

  // The twist depends only on the distance from the centre, and rotating
  // (dx, dy) by it is dx·cos − dy·sin, so the per-pixel atan2/cos/sin of the
  // original collapse into a table of cos/sin(twist) over distance, sampled
  // every 1/STEPS px and linearly interpolated.
  const STEPS = 16;
  const n = Math.ceil(maxRadius * STEPS) + 2;
  const cosT = new Float64Array(n);
  const sinT = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const dist = k / STEPS;
    const twist = useOscillation
      ? Math.sin(dist * oscillationFrequency) * spiralStrength * direction
      : spiralStrength * (1 - dist / maxRadius) * direction;
    cosT[k] = Math.cos(twist);
    sinT[k] = Math.sin(twist);
  }

  const maxX = width - 1, maxY = height - 1;
  // One little-endian RGBA word per pixel.
  const src32 = imageData.byteOffset % 4 === 0
    ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
    : new Uint32Array(imageData.slice().buffer, 0, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  let dstIdx = 0;
  for (let y = 0; y < height; y++) {
    const dy = y - centerY;
    const dy2 = dy * dy;
    for (let x = 0; x < width; x++, dstIdx++) {
      const dx = x - centerX;
      const t = Math.sqrt(dx * dx + dy2) * STEPS;
      const k = t | 0;
      const f = t - k;
      const c = cosT[k] + (cosT[k + 1] - cosT[k]) * f;
      const s = sinT[k] + (sinT[k + 1] - sinT[k]) * f;

      // Clamped floor: truncation equals floor once clamped to ≥ 0.
      let fx = centerX + dx * c - dy * s;
      let fy = centerY + dx * s + dy * c;
      fx = fx < 0 ? 0 : fx > maxX ? maxX : fx;
      fy = fy < 0 ? 0 : fy > maxY ? maxY : fy;
      const srcX = fx | 0, srcY = fy | 0;

      out32[dstIdx] = src32[srcY * width + srcX] | 0xff000000;
    }
  }
}
