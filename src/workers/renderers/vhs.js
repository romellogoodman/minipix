import { randFloat } from "../utils.js";

export default function vhs({ imageData, width, height, config, random, outputData }) {
  const trackingNoise = randFloat(config.trackingNoise, random);
  const colorBleed = Math.max(1, Math.round(width * randFloat(config.colorBleedPercent, random)));
  const wobble = Math.max(1, width * randFloat(config.wobblePercent, random));
  const noiseScale = 255 * randFloat(config.noiseIntensity, random);

  const trackingOffsets = new Int16Array(height);
  const numTrackingLines = Math.floor(height * trackingNoise);
  for (let i = 0; i < numTrackingLines; i++) {
    const lineY = Math.floor(random() * height);
    const offset = Math.floor((random() - 0.5) * width * 0.1);
    for (let dy = -2; dy <= 2; dy++) {
      const y = lineY + dy;
      if (y >= 0 && y < height) trackingOffsets[y] = offset;
    }
  }

  const wobblePhase = random() * 10;
  const wrap = (v) => (v < 0 ? v + width : v >= width ? v - width : v);
  const bleedR = new Int32Array(width);
  const bleedB = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    bleedR[x] = wrap(x + colorBleed);
    bleedB[x] = wrap(x - colorBleed);
  }

  // Per-pixel noise comes from an inline xorshift32* stream seeded once from
  // the render RNG instead of a random() call per pixel.
  let s = (random() * 4294967296) | 0 || 1;
  const noiseLUT = new Float32Array(4096);
  for (let k = 0; k < 4096; k++) noiseLUT[k] = ((k + 0.5) / 4096 - 0.5) * noiseScale;

  // Opaque pixels written as little-endian RGBA words, rounded to nearest.
  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, width * height);

  for (let y = 0; y < height; y++) {
    const wobbleOffset = Math.round(Math.sin(y * 0.1 + wobblePhase) * wobble);
    const totalOffset = wobbleOffset + trackingOffsets[y];
    const rowOffset = y * width;
    const dim = (y & 1) === 0 ? 0.9 : 1;

    let srcX = (totalOffset % width + width) % width;
    for (let x = 0, p = rowOffset; x < width; x++, p++, srcX = srcX + 1 === width ? 0 : srcX + 1) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const noise = noiseLUT[Math.imul(s, 0x2545f491) >>> 20];
      const r = Math.min(255, Math.max(0, (imageData[(rowOffset + bleedR[srcX]) * 4] + noise) * dim));
      const g = Math.min(255, Math.max(0, (imageData[(rowOffset + srcX) * 4 + 1] + noise) * dim));
      const b = Math.min(255, Math.max(0, (imageData[(rowOffset + bleedB[srcX]) * 4 + 2] + noise) * dim));
      out32[p] = -16777216 | ((b + 0.5) << 16) | ((g + 0.5) << 8) | (r + 0.5);
    }
  }
}
