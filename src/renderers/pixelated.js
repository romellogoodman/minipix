import {
  createSeededRandom,
  calculateAdaptivePixelSize,
  getAverageColorInBlock,
} from "../utils/index.js";
import { rendererConfig } from "./config.js";

const pixelated = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  // Draw original image to canvas so we can read pixel data
  ctx.drawImage(image, 0, 0, image.width, image.height);

  // Get image data for color sampling
  const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Create new image data for output
  const outputData = ctx.createImageData(canvas.width, canvas.height);

  // Calculate adaptive block size based on image dimensions
  const blockSize = calculateAdaptivePixelSize(
    image.width,
    image.height,
    random
  );

  // Process each block in the grid
  for (let y = 0; y < canvas.height; y += blockSize) {
    for (let x = 0; x < canvas.width; x += blockSize) {
      const avgColor = getAverageColorInBlock(
        sourceData,
        x,
        y,
        blockSize,
        canvas.width,
        canvas.height
      );

      // Calculate block boundaries
      const endX = Math.min(x + blockSize, canvas.width);
      const endY = Math.min(y + blockSize, canvas.height);

      // Fill the block in the output data directly
      for (let by = y; by < endY; by++) {
        for (let bx = x; bx < endX; bx++) {
          const index = (by * canvas.width + bx) * 4;
          outputData.data[index] = avgColor.r;
          outputData.data[index + 1] = avgColor.g;
          outputData.data[index + 2] = avgColor.b;
          outputData.data[index + 3] = 255; // Full opacity
        }
      }
    }
  }

  // Single putImageData call instead of many fillRect calls
  ctx.putImageData(outputData, 0, 0);

  ctx.restore();
};

pixelated.displayName = rendererConfig.pixelated.displayName;

export default pixelated;
