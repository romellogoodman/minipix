import { setupRenderer, randInt, randFloat, createCanvasLike } from "../utils/index.js";
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
  const cells = sqrCount / 2;

  // Each 2x2 cell holds one source tile as-is (top-left), flipped
  // horizontally (top-right), vertically (bottom-left) and both
  // (bottom-right). The as-is tiles are a contiguous grid in the source, so
  // build the pattern separably instead of tile by tile:
  //   1. scale the source square once into a half-size grid of tiles,
  //   2. lay its columns out as-is / mirrored pairs,
  //   3. lay those rows out as-is / mirrored pairs on the output.
  // That's 1 + 4 * cells draws instead of 4 * cells^2.
  const gridW = Math.ceil(cells * sqrWidth);
  const gridH = Math.ceil(cells * sqrHeight);
  const grid = createCanvasLike(canvas, gridW, gridH);
  grid
    .getContext("2d")
    .drawImage(image, sourceOffsetX, sourceOffsetY, imgSize, imgSize, 0, 0, cells * sqrWidth, cells * sqrHeight);

  const cols = createCanvasLike(canvas, Math.ceil(outputWidth), gridH);
  const cctx = cols.getContext("2d");
  for (let c = 0; c < cells; c++) {
    const sx = c * sqrWidth;
    const dx = 2 * c * sqrWidth;
    cctx.drawImage(grid, sx, 0, sqrWidth, gridH, dx, 0, sqrWidth, gridH);
    // Mirror about the right edge of the as-is column.
    cctx.setTransform(-1, 0, 0, 1, 2 * (dx + sqrWidth), 0);
    cctx.drawImage(grid, sx, 0, sqrWidth, gridH, dx - sqrWidth + sqrWidth, 0, sqrWidth, gridH);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  for (let r = 0; r < cells; r++) {
    const sy = r * sqrHeight;
    const dy = offsetY + 2 * r * sqrHeight;
    ctx.drawImage(cols, 0, sy, outputWidth, sqrHeight, offsetX, dy, outputWidth, sqrHeight);
    ctx.setTransform(1, 0, 0, -1, 0, 2 * (dy + sqrHeight));
    ctx.drawImage(cols, 0, sy, outputWidth, sqrHeight, offsetX, dy, outputWidth, sqrHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
};

kaleidoscope.displayName = "kaleidoscope";

export default kaleidoscope;
