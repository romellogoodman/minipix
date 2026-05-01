import { randFloat } from "../utils.js";

export default function waves({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const amplitude = minDim * randFloat(config.amplitudePercent, random);
  const frequency = randFloat(config.frequency, random);
  const isVertical = random() < 0.5;
  const phase = random() * Math.PI * 2;

  const wrapW = (v) => ((v % width) + width) % width;
  const wrapH = (v) => ((v % height) + height) % height;

  if (isVertical) {
    for (let y = 0; y < height; y++) {
      const wave = Math.sin(y * frequency + phase) * amplitude;
      for (let x = 0; x < width; x++) {
        const srcX = wrapW(Math.floor(x + wave));
        const srcIdx = (y * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;
        outputData[dstIdx] = imageData[srcIdx];
        outputData[dstIdx + 1] = imageData[srcIdx + 1];
        outputData[dstIdx + 2] = imageData[srcIdx + 2];
        outputData[dstIdx + 3] = 255;
      }
    }
  } else {
    const waveLUT = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      waveLUT[x] = Math.floor(Math.sin(x * frequency + phase) * amplitude);
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcY = wrapH(y + waveLUT[x]);
        const srcIdx = (srcY * width + x) * 4;
        const dstIdx = (y * width + x) * 4;
        outputData[dstIdx] = imageData[srcIdx];
        outputData[dstIdx + 1] = imageData[srcIdx + 1];
        outputData[dstIdx + 2] = imageData[srcIdx + 2];
        outputData[dstIdx + 3] = 255;
      }
    }
  }
}
