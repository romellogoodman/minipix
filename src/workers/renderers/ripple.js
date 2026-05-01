import { randomNumber, randFloat } from "../utils.js";

export default function ripple({ imageData, width, height, config, random, outputData }) {
  const numRipples = randomNumber(config.numRipples.min, config.numRipples.max, random);
  const minDimension = Math.min(width, height);
  const amplitudePercent =
    numRipples === 1 ? config.singleRippleAmplitudePercent : randFloat(config.amplitudePercent, random);
  const amplitude = minDimension * amplitudePercent;
  // Frequency expressed per-pixel-of-min-dimension so ring density is
  // resolution-independent.
  const frequency = randFloat(config.frequency, random) / minDimension * 1000;

  const ripples = [];
  for (let i = 0; i < numRipples; i++) {
    ripples.push({
      x: random() * width,
      y: random() * height,
      phase: random() * Math.PI * 2,
    });
  }

  // Center the group on the canvas, but leave a single ripple where it fell.
  if (numRipples > 1) {
    const cx = ripples.reduce((s, r) => s + r.x, 0) / numRipples;
    const cy = ripples.reduce((s, r) => s + r.y, 0) / numRipples;
    for (const r of ripples) { r.x += width / 2 - cx; r.y += height / 2 - cy; }
  }

  // Smooth falloff instead of a hard influence-radius cutoff.
  const falloffScale = 3 / (amplitude / frequency + amplitude);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let offsetX = 0, offsetY = 0;

      for (const r of ripples) {
        const dx = x - r.x;
        const dy = y - r.y;
        const distSq = dx * dx + dy * dy;
        if (distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const decay = Math.exp(-dist * falloffScale);
        if (decay < 0.01) continue;
        const wave = Math.sin(dist * frequency + r.phase) * amplitude * decay;
        const invDist = 1 / dist;
        offsetX += dx * invDist * wave;
        offsetY += dy * invDist * wave;
      }

      const srcX = Math.max(0, Math.min(width - 1, Math.round(x + offsetX)));
      const srcY = Math.max(0, Math.min(height - 1, Math.round(y + offsetY)));
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;
      outputData[dstIdx] = imageData[srcIdx];
      outputData[dstIdx + 1] = imageData[srcIdx + 1];
      outputData[dstIdx + 2] = imageData[srcIdx + 2];
      outputData[dstIdx + 3] = 255;
    }
  }
}
