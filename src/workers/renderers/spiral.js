import { createSeededRandom, map } from "../utils.js";

export default function spiral(imageData, width, height, config, seed) {
  const random = createSeededRandom(seed);
  const outputData = new Uint8ClampedArray(imageData.length);

  const spiralStrength = map(
    random(),
    0,
    1,
    config.spiralStrength.min,
    config.spiralStrength.max
  );
  const oscillationFrequency = map(
    random(),
    0,
    1,
    config.oscillationFrequency.min,
    config.oscillationFrequency.max
  );
  const useOscillation = random() < config.oscillationProbability;
  const direction = random() < 0.5 ? 1 : -1;

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const twist = useOscillation
        ? Math.sin(dist * oscillationFrequency) * spiralStrength
        : spiralStrength * (1 - dist / maxRadius) * direction;
      const newAngle = angle + twist;

      const srcX = Math.floor(centerX + Math.cos(newAngle) * dist);
      const srcY = Math.floor(centerY + Math.sin(newAngle) * dist);

      const clampedSrcX = Math.max(0, Math.min(width - 1, srcX));
      const clampedSrcY = Math.max(0, Math.min(height - 1, srcY));

      const srcIdx = (clampedSrcY * width + clampedSrcX) * 4;
      const dstIdx = (y * width + x) * 4;

      outputData[dstIdx] = imageData[srcIdx];
      outputData[dstIdx + 1] = imageData[srcIdx + 1];
      outputData[dstIdx + 2] = imageData[srcIdx + 2];
      outputData[dstIdx + 3] = 255;
    }
  }

  return outputData;
}
