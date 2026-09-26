import { setupRenderer, randInt, shuffleArray } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const barSwap = ({ canvas, image, seed = Date.now(), config = rendererConfig.barSwap }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const isVertical = random() < 0.5;
  const numBars = randInt(config.numBars, random);

  const barIndices = Array.from({ length: numBars }, (_, i) => i);
  const shuffledIndices = shuffleArray(barIndices, random);

  if (isVertical) {
    const barWidth = canvas.width / numBars;
    shuffledIndices.forEach((sourceIndex, destIndex) => {
      ctx.drawImage(
        image,
        sourceIndex * barWidth, 0, barWidth, image.height,
        destIndex * barWidth, 0, barWidth, canvas.height
      );
    });
  } else {
    const barHeight = canvas.height / numBars;
    shuffledIndices.forEach((sourceIndex, destIndex) => {
      ctx.drawImage(
        image,
        0, sourceIndex * barHeight, image.width, barHeight,
        0, destIndex * barHeight, canvas.width, barHeight
      );
    });
  }
};

barSwap.displayName = "barSwap";

export default barSwap;
