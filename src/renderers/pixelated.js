import { setupRenderer, calculateAdaptivePixelSize, getAverageColorInBlock } from "../utils/index.js";

const pixelated = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);
  const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const outputData = ctx.createImageData(canvas.width, canvas.height);

  const blockSize = calculateAdaptivePixelSize(image.width, image.height, random);

  for (let y = 0; y < canvas.height; y += blockSize) {
    for (let x = 0; x < canvas.width; x += blockSize) {
      const avgColor = getAverageColorInBlock(sourceData, x, y, blockSize, canvas.width, canvas.height);
      const endX = Math.min(x + blockSize, canvas.width);
      const endY = Math.min(y + blockSize, canvas.height);

      for (let by = y; by < endY; by++) {
        for (let bx = x; bx < endX; bx++) {
          const index = (by * canvas.width + bx) * 4;
          outputData.data[index] = avgColor.r;
          outputData.data[index + 1] = avgColor.g;
          outputData.data[index + 2] = avgColor.b;
          outputData.data[index + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(outputData, 0, 0);
};

pixelated.displayName = "pixelated";

export default pixelated;
