import { createSeededRandom, randomNumber, map } from "../utils.js";

export default function waves(imageData, width, height, config, seed) {
  const random = createSeededRandom(seed);
  const outputData = new Uint8ClampedArray(imageData.length);

  const amplitude = randomNumber(
    config.amplitude.min,
    config.amplitude.max,
    random
  );
  const frequency = map(
    random(),
    0,
    1,
    config.frequency.min,
    config.frequency.max
  );
  const isVertical = random() < 0.5;
  const phase = random() * Math.PI * 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let srcX, srcY;

      if (isVertical) {
        const wave = Math.sin(y * frequency + phase) * amplitude;
        srcX = Math.floor(x + wave);
        srcY = y;
      } else {
        const wave = Math.sin(x * frequency + phase) * amplitude;
        srcX = x;
        srcY = Math.floor(y + wave);
      }

      srcX = ((srcX % width) + width) % width;
      srcY = ((srcY % height) + height) % height;

      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;

      outputData[dstIdx] = imageData[srcIdx];
      outputData[dstIdx + 1] = imageData[srcIdx + 1];
      outputData[dstIdx + 2] = imageData[srcIdx + 2];
      outputData[dstIdx + 3] = 255;
    }
  }

  return outputData;
}
