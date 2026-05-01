import { setupRenderer, randFloat, randInt, randomNumber } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const glitch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);

  const config = rendererConfig.glitch;
  const numSlices = randInt(config.numSlices, random);
  const maxOffset = randFloat(config.maxOffset, random);
  const shouldInvert = random() < config.invertProbability;

  for (let i = 0; i < numSlices; i++) {
    const sliceY = Math.floor(random() * canvas.height);
    const sliceHeight = randomNumber(2, Math.floor(canvas.height / 10), random);
    const offset = Math.floor((random() - 0.5) * 2 * canvas.width * maxOffset);

    const sliceData = ctx.getImageData(
      0,
      sliceY,
      canvas.width,
      Math.min(sliceHeight, canvas.height - sliceY)
    );

    if (random() < config.colorShiftProbability) {
      const shiftPx = Math.round(canvas.width * randFloat(config.colorShiftPercent, random));
      const shiftAmount = shiftPx * (random() < 0.5 ? -1 : 1);
      const channel = Math.floor(random() * 3);
      const data = sliceData.data;
      const len = data.length;
      // Iterate toward the shift direction so we read source pixels before
      // overwriting them.
      if (shiftAmount >= 0) {
        for (let p = 0; p < len; p += 4) {
          const s = p + shiftAmount * 4;
          if (s < len) data[p + channel] = data[s + channel];
        }
      } else {
        for (let p = len - 4; p >= 0; p -= 4) {
          const s = p + shiftAmount * 4;
          if (s >= 0) data[p + channel] = data[s + channel];
        }
      }
    }

    if (shouldInvert && random() < 0.5) {
      for (let p = 0; p < sliceData.data.length; p += 4) {
        sliceData.data[p] = 255 - sliceData.data[p];
        sliceData.data[p + 1] = 255 - sliceData.data[p + 1];
        sliceData.data[p + 2] = 255 - sliceData.data[p + 2];
      }
    }

    ctx.putImageData(sliceData, offset, sliceY);
    if (offset > 0) {
      ctx.putImageData(sliceData, offset - canvas.width, sliceY);
    } else if (offset < 0) {
      ctx.putImageData(sliceData, offset + canvas.width, sliceY);
    }
  }
};

glitch.displayName = "glitch";

export default glitch;
