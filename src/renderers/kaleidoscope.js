import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const kaleidoscope = ({ canvas, image, seed = Date.now(), config = rendererConfig.kaleidoscope }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const imgSize = Math.min(image.width, image.height);
  const sourceOffsetPercent = randFloat(config.sourceOffsetPercent, random);
  const sourceOffsetX = (image.width - imgSize) * sourceOffsetPercent;
  const sourceOffsetY = (image.height - imgSize) * sourceOffsetPercent;

  const fillCanvas = random() < config.fillCanvasProbability;
  const outputWidth = fillCanvas ? canvas.width : Math.min(canvas.width, canvas.height);
  const outputHeight = fillCanvas ? canvas.height : Math.min(canvas.width, canvas.height);
  const offsetX = (canvas.width - outputWidth) / 2;
  const offsetY = (canvas.height - outputHeight) / 2;

  const sqrCount = randInt(config.squareCount, random) * 2;
  const sqrWidth = outputWidth / sqrCount;
  const sqrHeight = outputHeight / sqrCount;
  const srcSize = (imgSize / sqrCount) * 2;

  for (let i = 0; i < sqrCount; i += 2) {
    for (let j = 0; j < sqrCount; j += 2) {
      const sx = sourceOffsetX + (i * srcSize) / 2;
      const sy = sourceOffsetY + (j * srcSize) / 2;
      const dx = offsetX + i * sqrWidth;
      const dy = offsetY + j * sqrHeight;
      const mx = offsetX + (sqrCount - i - 2) * sqrWidth;
      const my = offsetY + (sqrCount - j - 2) * sqrHeight;

      // top-left: identity
      ctx.drawImage(image, sx, sy, srcSize, srcSize, dx, dy, sqrWidth, sqrHeight);

      // bottom-right: 180° rotation
      ctx.save();
      ctx.rotate(Math.PI);
      ctx.translate(-canvas.width, -canvas.height);
      ctx.drawImage(image, sx, sy, srcSize, srcSize, mx, my, sqrWidth, sqrHeight);
      ctx.restore();

      // bottom-left: vertical flip
      ctx.save();
      ctx.scale(1, -1);
      ctx.translate(0, -canvas.height);
      ctx.drawImage(image, sx, sy, srcSize, srcSize, dx, my, sqrWidth, sqrHeight);

      // top-right: vertical flip + 180° = horizontal flip
      ctx.rotate(Math.PI);
      ctx.translate(-canvas.width, -canvas.height);
      ctx.drawImage(image, sx, sy, srcSize, srcSize, mx, dy, sqrWidth, sqrHeight);
      ctx.restore();
    }
  }
};

kaleidoscope.displayName = "kaleidoscope";

export default kaleidoscope;
