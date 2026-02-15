import { createSeededRandom, randomNumber, shuffleArray } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const gridSwap = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  // Calculate aspect ratio and adapt grid accordingly
  const config = rendererConfig.gridSwap;
  const aspectRatio = canvas.width / canvas.height;
  const baseGridSize = randomNumber(
    config.baseGridSize.min,
    config.baseGridSize.max,
    random
  );

  let columns, rows;

  if (aspectRatio > 1.5) {
    // Wide/landscape image - more columns than rows
    columns =
      baseGridSize +
      randomNumber(
        config.extraGridCells.min,
        config.extraGridCells.max,
        random
      );
    rows = baseGridSize;
  } else if (aspectRatio < 0.67) {
    // Tall/portrait image - more rows than columns
    columns = baseGridSize;
    rows =
      baseGridSize +
      randomNumber(
        config.extraGridCells.min,
        config.extraGridCells.max,
        random
      );
  } else {
    // Square-ish image - equal or nearly equal
    columns = baseGridSize;
    rows = baseGridSize;
  }

  const cellWidth = canvas.width / columns;
  const cellHeight = canvas.height / rows;

  // Create array of cell indices and shuffle them
  const totalCells = columns * rows;
  const cellIndices = Array.from({ length: totalCells }, (_, i) => i);
  const shuffledIndices = shuffleArray(cellIndices, random);

  // Draw each cell
  for (let destIndex = 0; destIndex < totalCells; destIndex++) {
    const sourceIndex = shuffledIndices[destIndex];

    // Calculate source position
    const sourceCol = sourceIndex % columns;
    const sourceRow = Math.floor(sourceIndex / columns);
    const sourceX = sourceCol * cellWidth;
    const sourceY = sourceRow * cellHeight;

    // Calculate destination position
    const destCol = destIndex % columns;
    const destRow = Math.floor(destIndex / columns);
    const destX = destCol * cellWidth;
    const destY = destRow * cellHeight;

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      cellWidth,
      cellHeight,
      destX,
      destY,
      cellWidth,
      cellHeight
    );
  }

  ctx.restore();
};

gridSwap.displayName = rendererConfig.gridSwap.displayName;

export default gridSwap;
