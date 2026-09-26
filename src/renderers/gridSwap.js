import { setupRenderer, randInt, shuffleArray } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const gridSwap = ({ canvas, image, seed = Date.now(), config = rendererConfig.gridSwap }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const aspectRatio = canvas.width / canvas.height;
  const baseGridSize = randInt(config.baseGridSize, random);

  let columns, rows;
  if (aspectRatio > 1.5) {
    columns = baseGridSize + randInt(config.extraGridCells, random);
    rows = baseGridSize;
  } else if (aspectRatio < 0.67) {
    columns = baseGridSize;
    rows = baseGridSize + randInt(config.extraGridCells, random);
  } else {
    columns = baseGridSize;
    rows = baseGridSize;
  }

  const cellWidth = canvas.width / columns;
  const cellHeight = canvas.height / rows;
  const totalCells = columns * rows;
  const shuffledIndices = shuffleArray(
    Array.from({ length: totalCells }, (_, i) => i),
    random
  );

  for (let destIndex = 0; destIndex < totalCells; destIndex++) {
    const sourceIndex = shuffledIndices[destIndex];
    const sourceX = (sourceIndex % columns) * cellWidth;
    const sourceY = Math.floor(sourceIndex / columns) * cellHeight;
    const destX = (destIndex % columns) * cellWidth;
    const destY = Math.floor(destIndex / columns) * cellHeight;

    ctx.drawImage(image, sourceX, sourceY, cellWidth, cellHeight, destX, destY, cellWidth, cellHeight);
  }
};

gridSwap.displayName = "gridSwap";

export default gridSwap;
