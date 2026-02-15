import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const stacked = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  // Random number of stacks
  const config = rendererConfig.stacked;
  const numStacks = randomNumber(
    config.numStacks.min,
    config.numStacks.max,
    random
  );

  // Create stacks with sizes mapped from max to min
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(
      i,
      0,
      numStacks - 1,
      config.sizeFactor.max,
      config.sizeFactor.min
    );
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  });

  ctx.restore();
};

stacked.displayName = rendererConfig.stacked.displayName;

export default stacked;
