import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const kaleidoscope = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  const config = rendererConfig.kaleidoscope;

  // Use smaller dimension for square source area from image
  const imgSize = Math.min(image.width, image.height);

  // Calculate source offset for non-square images
  const maxSourceOffsetX = image.width - imgSize;
  const maxSourceOffsetY = image.height - imgSize;
  const sourceOffsetPercent = map(
    random(),
    0,
    1,
    config.sourceOffsetPercent.min,
    config.sourceOffsetPercent.max
  );
  const sourceOffsetX = maxSourceOffsetX * sourceOffsetPercent;
  const sourceOffsetY = maxSourceOffsetY * sourceOffsetPercent;

  // Decide whether to fill canvas or maintain square
  const fillCanvas = random() < config.fillCanvasProbability;
  const outputWidth = fillCanvas
    ? canvas.width
    : Math.min(canvas.width, canvas.height);
  const outputHeight = fillCanvas
    ? canvas.height
    : Math.min(canvas.width, canvas.height);
  const offsetX = (canvas.width - outputWidth) / 2;
  const offsetY = (canvas.height - outputHeight) / 2;

  // Random square count (multiplied by 2 to match original algorithm)
  const sqrCountBase = randomNumber(
    config.squareCount.min,
    config.squareCount.max,
    random
  );
  const sqrCount = sqrCountBase * 2;

  ctx.save();

  // If sqrCount is 0, just draw the image
  if (sqrCount === 0) {
    ctx.drawImage(image, 0, 0, image.width, image.height);
  } else {
    // Draw mirrored squares
    for (let i = 0; i < sqrCount; i += 2) {
      for (let j = 0; j < sqrCount; j += 2) {
        const srcSize = (imgSize / sqrCount) * 2;
        const sx = sourceOffsetX + (i * srcSize) / 2;
        const sy = sourceOffsetY + (j * srcSize) / 2;

        const sqrWidth = outputWidth / sqrCount;
        const sqrHeight = outputHeight / sqrCount;
        const dx = offsetX + i * sqrWidth;
        const dy = offsetY + j * sqrHeight;

        ctx.save();

        // Draw original square (top-left of 2x2 block)
        ctx.drawImage(
          image,
          sx,
          sy,
          srcSize,
          srcSize,
          dx,
          dy,
          sqrWidth,
          sqrHeight
        );

        // Draw rotated 180 degrees (bottom-right of 2x2 block)
        ctx.rotate(Math.PI);
        ctx.translate(canvas.width * -1, canvas.height * -1);
        ctx.drawImage(
          image,
          sx,
          sy,
          srcSize,
          srcSize,
          offsetX + (sqrCount - i - 2) * sqrWidth,
          offsetY + (sqrCount - j - 2) * sqrHeight,
          sqrWidth,
          sqrHeight
        );
        ctx.restore();

        ctx.save();
        // Draw flipped vertically (bottom-left of 2x2 block)
        ctx.scale(1, -1);
        ctx.translate(0, canvas.height * -1);
        ctx.drawImage(
          image,
          sx,
          sy,
          srcSize,
          srcSize,
          dx,
          offsetY + (sqrCount - j - 2) * sqrHeight,
          sqrWidth,
          sqrHeight
        );

        // Draw flipped horizontally (top-right of 2x2 block)
        ctx.rotate(Math.PI);
        ctx.translate(canvas.width * -1, canvas.height * -1);
        ctx.drawImage(
          image,
          sx,
          sy,
          srcSize,
          srcSize,
          offsetX + (sqrCount - i - 2) * sqrWidth,
          dy,
          sqrWidth,
          sqrHeight
        );
        ctx.restore();
      }
    }
  }

  ctx.restore();
};

kaleidoscope.displayName = rendererConfig.kaleidoscope.displayName;

export default kaleidoscope;
