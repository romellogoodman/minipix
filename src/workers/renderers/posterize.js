import { randomNumber } from "../utils.js";

export default function posterize({ imageData, config, random, outputData }) {
  const levels = randomNumber(config.levels.min, config.levels.max, random);

  // Endpoint-preserving quantization via 256-entry LUT.
  const lut = new Uint8Array(256);
  const step = 255 / (levels - 1);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round(Math.round((v / 255) * (levels - 1)) * step);
  }

  for (let i = 0; i < imageData.length; i += 4) {
    outputData[i] = lut[imageData[i]];
    outputData[i + 1] = lut[imageData[i + 1]];
    outputData[i + 2] = lut[imageData[i + 2]];
    outputData[i + 3] = 255;
  }
}
