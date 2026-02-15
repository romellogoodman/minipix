import { createSeededRandom, randomNumber, shuffleArray } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const barSwap = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  // Randomly choose direction: horizontal (0) or vertical (1)
  const isVertical = random() < 0.5;

  // Random number of bars
  const config = rendererConfig.barSwap;
  const numBars = randomNumber(config.numBars.min, config.numBars.max, random);

  // Create array of bar indices and shuffle them
  const barIndices = Array.from({ length: numBars }, (_, i) => i);
  const shuffledIndices = shuffleArray(barIndices, random);

  if (isVertical) {
    // Vertical bars
    const barWidth = canvas.width / numBars;

    shuffledIndices.forEach((sourceIndex, destIndex) => {
      const sourceX = sourceIndex * barWidth;
      const destX = destIndex * barWidth;

      ctx.drawImage(
        image,
        sourceX,
        0, // source x, y
        barWidth,
        image.height, // source width, height
        destX,
        0, // dest x, y
        barWidth,
        canvas.height // dest width, height
      );
    });
  } else {
    // Horizontal bars
    const barHeight = canvas.height / numBars;

    shuffledIndices.forEach((sourceIndex, destIndex) => {
      const sourceY = sourceIndex * barHeight;
      const destY = destIndex * barHeight;

      ctx.drawImage(
        image,
        0,
        sourceY, // source x, y
        image.width,
        barHeight, // source width, height
        0,
        destY, // dest x, y
        canvas.width,
        barHeight // dest width, height
      );
    });
  }

  ctx.restore();
};

barSwap.displayName = rendererConfig.barSwap.displayName;

export default barSwap;
