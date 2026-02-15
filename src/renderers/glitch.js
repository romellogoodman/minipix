import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const glitch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const random = createSeededRandom(seed);

  ctx.save();

  // Draw original image first
  ctx.drawImage(image, 0, 0);

  const config = rendererConfig.glitch;
  const numSlices = randomNumber(
    config.numSlices.min,
    config.numSlices.max,
    random
  );
  const maxOffset = map(
    random(),
    0,
    1,
    config.maxOffset.min,
    config.maxOffset.max
  );
  const shouldInvert = random() < config.invertProbability;

  // Create horizontal glitch slices
  for (let i = 0; i < numSlices; i++) {
    const sliceY = Math.floor(random() * canvas.height);
    const sliceHeight = randomNumber(2, Math.floor(canvas.height / 10), random);
    const offset = Math.floor((random() - 0.5) * 2 * canvas.width * maxOffset);

    // Get slice data
    const sliceData = ctx.getImageData(
      0,
      sliceY,
      canvas.width,
      Math.min(sliceHeight, canvas.height - sliceY)
    );

    // Color channel shift
    if (random() < config.colorShiftProbability) {
      const shiftAmount = randomNumber(
        config.colorShiftAmount.min,
        config.colorShiftAmount.max,
        random
      );
      const channelToShift = Math.floor(random() * 3); // R, G, or B

      for (let p = 0; p < sliceData.data.length; p += 4) {
        const shiftedIdx = p + shiftAmount * 4;
        if (shiftedIdx >= 0 && shiftedIdx < sliceData.data.length - 4) {
          sliceData.data[p + channelToShift] =
            sliceData.data[shiftedIdx + channelToShift];
        }
      }
    }

    // Invert colors (50/50 to enable, then 50/50 per slice)
    if (shouldInvert && random() < 0.5) {
      for (let p = 0; p < sliceData.data.length; p += 4) {
        sliceData.data[p] = 255 - sliceData.data[p]; // R
        sliceData.data[p + 1] = 255 - sliceData.data[p + 1]; // G
        sliceData.data[p + 2] = 255 - sliceData.data[p + 2]; // B
      }
    }

    // Draw slice with horizontal offset (wrapping)
    ctx.putImageData(sliceData, offset, sliceY);
    if (offset > 0) {
      ctx.putImageData(sliceData, offset - canvas.width, sliceY);
    } else if (offset < 0) {
      ctx.putImageData(sliceData, offset + canvas.width, sliceY);
    }
  }

  ctx.restore();
};

glitch.displayName = rendererConfig.glitch.displayName;

export default glitch;
