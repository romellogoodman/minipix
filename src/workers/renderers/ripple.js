import { randomNumber, map } from "../utils.js";

export default function ripple({ imageData, width, height, config, random, outputData }) {

  const numRipples = randomNumber(
    config.numRipples.min,
    config.numRipples.max,
    random
  );
  const minDimension = Math.min(width, height);
  const amplitudePercent =
    numRipples === 1
      ? config.singleRippleAmplitudePercent
      : map(
          random(),
          0,
          1,
          config.amplitudePercent.min,
          config.amplitudePercent.max
        );
  const amplitude = minDimension * amplitudePercent;
  const frequency = map(
    random(),
    0,
    1,
    config.frequency.min,
    config.frequency.max
  );

  // Generate ripple centers with precomputed max influence radius
  // Ripples have negligible effect beyond this distance
  const maxInfluenceRadius = amplitude / frequency + amplitude;
  const ripples = [];
  for (let i = 0; i < numRipples; i++) {
    ripples.push({
      x: random() * width,
      y: random() * height,
      phase: random() * Math.PI * 2,
    });
  }

  // Center the group of ripples on the canvas
  const centroidX = ripples.reduce((sum, r) => sum + r.x, 0) / numRipples;
  const centroidY = ripples.reduce((sum, r) => sum + r.y, 0) / numRipples;
  const offsetToCenter = {
    x: width / 2 - centroidX,
    y: height / 2 - centroidY,
  };
  for (const ripple of ripples) {
    ripple.x += offsetToCenter.x;
    ripple.y += offsetToCenter.y;
  }

  const maxRadiusSq = maxInfluenceRadius * maxInfluenceRadius;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let offsetX = 0;
      let offsetY = 0;

      for (const ripple of ripples) {
        const dx = x - ripple.x;
        const dy = y - ripple.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > maxRadiusSq) continue;
        if (distSq === 0) continue;

        const dist = Math.sqrt(distSq);
        const wave = Math.sin(dist * frequency + ripple.phase) * amplitude;
        const invDist = 1 / dist;
        offsetX += dx * invDist * wave;
        offsetY += dy * invDist * wave;
      }

      const srcX = Math.floor(Math.max(0, Math.min(width - 1, x + offsetX)));
      const srcY = Math.floor(Math.max(0, Math.min(height - 1, y + offsetY)));

      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;

      outputData[dstIdx] = imageData[srcIdx];
      outputData[dstIdx + 1] = imageData[srcIdx + 1];
      outputData[dstIdx + 2] = imageData[srcIdx + 2];
      outputData[dstIdx + 3] = 255;
    }
  }
}
