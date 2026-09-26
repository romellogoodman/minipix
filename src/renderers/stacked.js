import { setupRenderer, randInt, randFloat, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const stacked = ({ canvas, image, seed = Date.now(), config = rendererConfig.stacked }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const numStacks = randInt(config.numStacks, random);
  const innerSize = randFloat({ min: 0.1, max: config.sizeFactor.min * 2 }, random);

  for (let i = 0; i < numStacks; i++) {
    const sizeFactor = map(i, 0, numStacks - 1, config.sizeFactor.max, innerSize);
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
};

stacked.displayName = "stacked";

export default stacked;
