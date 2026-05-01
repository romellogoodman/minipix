import { randomNumber, randFloat } from "../utils.js";

export default function photocopy({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const noise = randFloat(config.noise, random);
  const generations = randomNumber(config.generations.min, config.generations.max, random);
  const smear = randomNumber(config.smear.min, config.smear.max, random);

  const effThreshold = threshold - generations * 0.03;
  const effNoise = noise * (1 + generations * 0.4);
  const tonerSpeckle = 0.002 * generations;

  const bandH = randomNumber(config.bandHeight.min, config.bandHeight.max, random);
  const band = Math.floor(random() * Math.max(1, height - bandH));

  const rowLum = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const inBand = y >= band && y < band + bandH;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      rowLum[x] = (0.299 * imageData[si] + 0.587 * imageData[si + 1] + 0.114 * imageData[si + 2]) / 255;
    }
    for (let x = 0; x < width; x++) {
      let minLum = rowLum[x];
      for (let s = 1; s <= smear; s++) {
        const l = rowLum[Math.max(0, x - s)];
        if (l < minLum) minLum = l;
      }

      const jittered = minLum + (random() - 0.5) * effNoise;
      let v = jittered > effThreshold ? 255 : 0;
      if (random() < tonerSpeckle) v = 0;
      if (inBand) v = Math.min(255, v + 200);

      const idx = (y * width + x) * 4;
      outputData[idx] = outputData[idx + 1] = outputData[idx + 2] = v;
      outputData[idx + 3] = 255;
    }
  }
}
