import { setupRenderer, calculateAdaptivePixelSize, getAverageColorInBlock } from "../utils/index.js";

const pixelated = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const blockSize = calculateAdaptivePixelSize(image.width, image.height, random);

  // Each block reads its own region then overwrites it, so in-place is safe.
  for (let y = 0; y < canvas.height; y += blockSize) {
    for (let x = 0; x < canvas.width; x += blockSize) {
      const c = getAverageColorInBlock(src, x, y, blockSize, canvas.width, canvas.height);
      const endX = Math.min(x + blockSize, canvas.width);
      const endY = Math.min(y + blockSize, canvas.height);
      for (let by = y; by < endY; by++) {
        for (let bx = x; bx < endX; bx++) {
          const i = (by * canvas.width + bx) * 4;
          src.data[i] = c.r; src.data[i + 1] = c.g; src.data[i + 2] = c.b; src.data[i + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(src, 0, 0);
};

pixelated.displayName = "pixelated";

export default pixelated;
