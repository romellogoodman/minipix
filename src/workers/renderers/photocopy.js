import { randomNumber, randFloat } from "../utils.js";

export default function photocopy({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const noise = randFloat(config.noise, random);
  const generations = randomNumber(config.generations.min, config.generations.max, random);
  const smear = randomNumber(config.smear.min, config.smear.max, random);

  // Each "generation" degrades: lower threshold, more noise
  const effThreshold = threshold - generations * 0.03;
  const effNoise = noise * (1 + generations * 0.4);
  const tonerSpeckle = 0.002 * generations;

  const band = Math.floor(random() * height);
  const bandH = randomNumber(config.bandHeight.min, config.bandHeight.max, random);

  for (let y = 0; y < height; y++) {
    const inBand = y >= band && y < band + bandH;
    for (let x = 0; x < width; x++) {
      // Horizontal smear: sample a few pixels to the left and take the darkest
      let minLum = 1;
      for (let s = 0; s <= smear; s++) {
        const sx = Math.max(0, x - s);
        const si = (y * width + sx) * 4;
        const l = (0.299 * imageData[si] + 0.587 * imageData[si + 1] + 0.114 * imageData[si + 2]) / 255;
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
