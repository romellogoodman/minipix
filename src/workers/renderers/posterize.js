import { randomNumber } from "../utils.js";

export default function posterize({ imageData, config, random, outputData }) {

  const levels = randomNumber(config.levels.min, config.levels.max, random);
  const step = 255 / levels;

  for (let i = 0; i < imageData.length; i += 4) {
    outputData[i] = Math.floor(imageData[i] / step) * step;
    outputData[i + 1] = Math.floor(imageData[i + 1] / step) * step;
    outputData[i + 2] = Math.floor(imageData[i + 2] / step) * step;
    outputData[i + 3] = 255;
  }
}
