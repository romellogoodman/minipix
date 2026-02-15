import { createSeededRandom, randomNumber } from "../utils.js";

export default function posterize(imageData, width, height, config, seed) {
  const random = createSeededRandom(seed);
  const outputData = new Uint8ClampedArray(imageData.length);

  const levels = randomNumber(config.levels.min, config.levels.max, random);
  const step = 255 / levels;

  for (let i = 0; i < imageData.length; i += 4) {
    outputData[i] = Math.floor(imageData[i] / step) * step;
    outputData[i + 1] = Math.floor(imageData[i + 1] / step) * step;
    outputData[i + 2] = Math.floor(imageData[i + 2] / step) * step;
    outputData[i + 3] = 255;
  }

  return outputData;
}
