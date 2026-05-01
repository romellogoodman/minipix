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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const twist = useOscillation
        ? Math.sin(dist * oscillationFrequency) * spiralStrength * direction
        : spiralStrength * (1 - dist / maxRadius) * direction;
      const newAngle = angle + twist;

      const srcX = Math.max(0, Math.min(width - 1, Math.floor(centerX + Math.cos(newAngle) * dist)));
      const srcY = Math.max(0, Math.min(height - 1, Math.floor(centerY + Math.sin(newAngle) * dist)));

      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;
      outputData[dstIdx] = imageData[srcIdx];
      outputData[dstIdx + 1] = imageData[srcIdx + 1];
      outputData[dstIdx + 2] = imageData[srcIdx + 2];
      outputData[dstIdx + 3] = 255;
    }
  }
}
