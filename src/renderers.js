import {
  map,
  randomNumber,
  applyRandomFlip,
  calculateAdaptivePixelSize,
  getAverageColorInBlock,
  shuffleArray,
  extractDominantColors,
  getLuminance,
  findNearestColor,
  drawHalftoneDot,
  applyBayerDithering,
  applyFloydSteinbergDithering,
  createSeededRandom,
} from "./utils.js";

// Renderer configuration
export const rendererConfig = {
  barSwap: {
    numBars: { min: 4, max: 50 },
  },
  chromaticShift: {
    offset: { min: -20, max: 20 },
  },
  gridSwap: {
    baseGridSize: { min: 2, max: 20 },
    extraGridCells: { min: 1, max: 3 },
  },
  halftone: {
    numColors: { min: 2, max: 6 },
    classicDots: {
      blockSize: { min: 1, max: 16 },
    },
    lines: {
      blockSize: { min: 1, max: 16 },
      lineWeightMultiplier: 1,
    },
  },
  kaleidoscope: {
    squareCount: { min: 2, max: 20 },
    sourceOffsetPercent: { min: 0, max: 1 }, // where to sample from in non-square images
    fillCanvasProbability: 0.5, // chance to stretch to fill vs maintain square
  },
  pixelated: {},
  scooch: {
    numScooches: { min: 1, max: 8 },
    scoochPercent: { min: 0.05, max: 0.5 },
  },
  stacked: {
    numStacks: { min: 2, max: 20 },
    sizeFactor: { min: 0.2, max: 1 },
  },
  stackedCircle: {
    numStacks: { min: 4, max: 20 },
    sizeFactor: { min: 0.2, max: 1 },
    rotation: { min: -180, max: 180 },
  },
  subdivision: {
    maxDepth: { min: 3, max: 5 },
    skipProbability: { min: 0.3, max: 0.6 },
    splitPercent: { min: 0.3, max: 0.7 },
    minSize: 10,
  },
};

export const barSwap = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

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

export const gridSwap = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

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

export const halftone = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors
  const config = rendererConfig.halftone;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Randomly select halftone mode
  const modes = ["bayer", "floydSteinberg", "classicDots", "lines"];
  const mode = modes[randomNumber(0, modes.length - 1, random)];

  // Clear canvas for rendering
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  switch (mode) {
    case "bayer": {
      // Bayer matrix dithering
      const dithered = applyBayerDithering(imageData, palette);
      ctx.putImageData(dithered, 0, 0);
      break;
    }

    case "floydSteinberg": {
      // Floyd-Steinberg error diffusion dithering
      const dithered = applyFloydSteinbergDithering(imageData, palette);
      ctx.putImageData(dithered, 0, 0);
      break;
    }

    case "classicDots": {
      // Classic halftone dots
      const adaptiveSize = calculateAdaptivePixelSize(
        image.width,
        image.height,
        random
      );
      const blockSize = Math.min(
        config.classicDots.blockSize.max,
        Math.max(config.classicDots.blockSize.min, adaptiveSize)
      );
      const shape = "circle";

      for (let y = 0; y < canvas.height; y += blockSize) {
        for (let x = 0; x < canvas.width; x += blockSize) {
          const avgColor = getAverageColorInBlock(
            imageData,
            x,
            y,
            blockSize,
            canvas.width,
            canvas.height
          );
          const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
          const nearestColor = findNearestColor(avgColor, palette);

          const dotRadius = (1 - luminance) * blockSize * 0.45;
          drawHalftoneDot(
            ctx,
            x + blockSize / 2,
            y + blockSize / 2,
            dotRadius,
            shape,
            nearestColor
          );
        }
      }

      break;
    }

    case "lines": {
      // Line-based halftone
      const adaptiveSize = calculateAdaptivePixelSize(
        image.width,
        image.height,
        random
      );
      const blockSize = Math.min(
        config.lines.blockSize.max,
        Math.max(config.lines.blockSize.min, adaptiveSize)
      );
      const orientation = ["horizontal", "vertical"][
        randomNumber(0, 1, random)
      ];

      for (let y = 0; y < canvas.height; y += blockSize) {
        for (let x = 0; x < canvas.width; x += blockSize) {
          const avgColor = getAverageColorInBlock(
            imageData,
            x,
            y,
            blockSize,
            canvas.width,
            canvas.height
          );
          const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
          const nearestColor = findNearestColor(avgColor, palette);

          ctx.fillStyle = `rgb(${nearestColor.r}, ${nearestColor.g}, ${nearestColor.b})`;

          const lineWeight =
            (1 - luminance) * blockSize * config.lines.lineWeightMultiplier;

          if (orientation === "horizontal") {
            const lineY = y + (blockSize - lineWeight) / 2;
            ctx.fillRect(x, lineY, blockSize, lineWeight);
          } else {
            // Vertical
            const lineX = x + (blockSize - lineWeight) / 2;
            ctx.fillRect(lineX, y, lineWeight, blockSize);
          }
        }
      }
      break;
    }
  }

  ctx.restore();
};

export const halftoneBayer = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors
  const config = rendererConfig.halftoneBayer;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Apply Bayer matrix dithering
  const dithered = applyBayerDithering(imageData, palette);
  ctx.putImageData(dithered, 0, 0);

  ctx.restore();
};

export const halftoneClassicDots = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors
  const config = rendererConfig.halftoneClassicDots;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Clear canvas for rendering
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Classic halftone dots
  const adaptiveSize = calculateAdaptivePixelSize(
    image.width,
    image.height,
    random
  );
  const blockSize = Math.min(
    config.blockSize.max,
    Math.max(config.blockSize.min, adaptiveSize)
  );
  const shape = "circle";

  for (let y = 0; y < canvas.height; y += blockSize) {
    for (let x = 0; x < canvas.width; x += blockSize) {
      const avgColor = getAverageColorInBlock(
        imageData,
        x,
        y,
        blockSize,
        canvas.width,
        canvas.height
      );
      const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
      const nearestColor = findNearestColor(avgColor, palette);

      const dotRadius = (1 - luminance) * blockSize * 0.45;
      drawHalftoneDot(
        ctx,
        x + blockSize / 2,
        y + blockSize / 2,
        dotRadius,
        shape,
        nearestColor
      );
    }
  }

  ctx.restore();
};

export const halftoneFloydSteinberg = ({
  canvas,
  image,
  seed = Date.now(),
}) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors
  const config = rendererConfig.halftoneFloydSteinberg;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Apply Floyd-Steinberg error diffusion dithering
  const dithered = applyFloydSteinbergDithering(imageData, palette);
  ctx.putImageData(dithered, 0, 0);

  ctx.restore();
};

export const halftoneLines = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors
  const config = rendererConfig.halftoneLines;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Clear canvas for rendering
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Line-based halftone
  const adaptiveSize = calculateAdaptivePixelSize(
    image.width,
    image.height,
    random
  );
  const blockSize = Math.min(
    config.blockSize.max,
    Math.max(config.blockSize.min, adaptiveSize)
  );
  const orientation = ["horizontal", "vertical"][randomNumber(0, 1, random)];

  for (let y = 0; y < canvas.height; y += blockSize) {
    for (let x = 0; x < canvas.width; x += blockSize) {
      const avgColor = getAverageColorInBlock(
        imageData,
        x,
        y,
        blockSize,
        canvas.width,
        canvas.height
      );
      const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
      const nearestColor = findNearestColor(avgColor, palette);

      ctx.fillStyle = `rgb(${nearestColor.r}, ${nearestColor.g}, ${nearestColor.b})`;

      const lineWeight =
        (1 - luminance) * blockSize * config.lineWeightMultiplier;

      if (orientation === "horizontal") {
        const lineY = y + (blockSize - lineWeight) / 2;
        ctx.fillRect(x, lineY, blockSize, lineWeight);
      } else {
        // Vertical
        const lineX = x + (blockSize - lineWeight) / 2;
        ctx.fillRect(lineX, y, lineWeight, blockSize);
      }
    }
  }

  ctx.restore();
};

export const kaleidoscope = ({ canvas, image, seed = Date.now() }) => {
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
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

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

export const pixelated = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

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

export const scooch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  const config = rendererConfig.scooch;

  // Random number of scooches
  const numScooches = randomNumber(
    config.numScooches.min,
    config.numScooches.max,
    random
  );

  // Randomly choose starting direction: horizontal (0) or vertical (1)
  let isVertical = random() < 0.5;

  // Create a temporary canvas to work with for multiple scooches
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");

  // Draw the original image to temp canvas
  tempCtx.drawImage(image, 0, 0);

  // Perform multiple scooches, alternating direction
  for (let i = 0; i < numScooches; i++) {
    // Calculate scooch amount for this iteration
    const scoochPercent = map(
      random(),
      0,
      1,
      config.scoochPercent.min,
      config.scoochPercent.max
    );
    const scoochAmount = isVertical
      ? Math.floor(canvas.height * scoochPercent)
      : Math.floor(canvas.width * scoochPercent);

    // Create another temp canvas for this scooch operation
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = canvas.width;
    nextCanvas.height = canvas.height;
    const nextCtx = nextCanvas.getContext("2d");

    if (isVertical) {
      // Vertical scooch - move top slice to bottom
      // Draw the slice from top (moves to bottom)
      nextCtx.drawImage(
        tempCanvas,
        0,
        0, // source x, y
        canvas.width,
        scoochAmount, // source width, height
        0,
        canvas.height - scoochAmount, // dest x, y
        canvas.width,
        scoochAmount // dest width, height
      );

      // Draw the rest of the image (moves to top)
      nextCtx.drawImage(
        tempCanvas,
        0,
        scoochAmount, // source x, y
        canvas.width,
        canvas.height - scoochAmount, // source width, height
        0,
        0, // dest x, y
        canvas.width,
        canvas.height - scoochAmount // dest width, height
      );
    } else {
      // Horizontal scooch - move left slice to right
      // Draw the slice from left (moves to right)
      nextCtx.drawImage(
        tempCanvas,
        0,
        0, // source x, y
        scoochAmount,
        canvas.height, // source width, height
        canvas.width - scoochAmount,
        0, // dest x, y
        scoochAmount,
        canvas.height // dest width, height
      );

      // Draw the rest of the image (moves to left)
      nextCtx.drawImage(
        tempCanvas,
        scoochAmount,
        0, // source x, y
        canvas.width - scoochAmount,
        canvas.height, // source width, height
        0,
        0, // dest x, y
        canvas.width - scoochAmount,
        canvas.height // dest width, height
      );
    }

    // Copy result back to temp canvas for next iteration
    tempCtx.clearRect(0, 0, canvas.width, canvas.height);
    tempCtx.drawImage(nextCanvas, 0, 0);

    // Alternate direction for next iteration
    isVertical = !isVertical;
  }

  // Draw final result to main canvas
  ctx.drawImage(tempCanvas, 0, 0);

  ctx.restore();
};

export const stacked = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Random number of stacks
  const config = rendererConfig.stacked;
  const numStacks = randomNumber(
    config.numStacks.min,
    config.numStacks.max,
    random
  );

  // Create stacks with sizes mapped from max to min
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(
      i,
      0,
      numStacks - 1,
      config.sizeFactor.max,
      config.sizeFactor.min
    );
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  });

  ctx.restore();
};

export const stackedCircle = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Randomly choose between uniform (50%) and scaled (50%) mode
  const isUniform = random() < 0.5;

  // Random number of stacks
  const config = rendererConfig.stackedCircle;
  const numStacks = randomNumber(
    config.numStacks.min,
    config.numStacks.max,
    random
  );

  // Randomly choose rotation mode: 0 = none, 1 = random, 2 = gradual
  const rotationMode = Math.floor(random() * 3);
  const targetRotation =
    rotationMode === 2
      ? randomNumber(config.rotation.min, config.rotation.max, random)
      : 0;

  if (isUniform) {
    // UNIFORM MODE: All stacks are the same size with concentric rings
    const width = image.width;
    const height = image.height;
    const x = 0;
    const y = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(width, height) / 2;

    // Render layers from back to front
    Array.from({ length: numStacks }).forEach((_, i) => {
      // Calculate rotation based on mode
      let rotation = 0;
      if (rotationMode === 1 && i !== 0) {
        // Random rotation for each layer (except first)
        rotation = randomNumber(
          config.rotation.min,
          config.rotation.max,
          random
        );
      } else if (rotationMode === 2) {
        // Gradual rotation mapped from 0 to target
        rotation = map(i, 0, numStacks - 1, 0, targetRotation);
      }

      ctx.save();

      // First layer (i=0) is unclipped full image
      if (i === 0) {
        // Apply rotation for first layer if needed
        if (rotation !== 0) {
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        ctx.drawImage(image, x, y, width, height);
      } else {
        // Calculate the radius for this layer (from max to smaller, skipping i=0)
        const radiusFactor = map(i, 1, numStacks - 1, 1, 0.2);
        const outerRadius = maxRadius * radiusFactor;

        // For all but the last layer, clip to a ring (donut shape)
        if (i < numStacks - 1) {
          // Calculate the inner radius (next layer's radius)
          const nextRadiusFactor = map(i + 1, 1, numStacks - 1, 1, 0.2);
          const innerRadius = maxRadius * nextRadiusFactor;

          // Create outer circle
          ctx.beginPath();
          ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);

          // Cut out inner circle (reverse winding for clipping)
          ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
          ctx.clip();
        } else {
          // Last layer is just a filled circle
          ctx.beginPath();
          ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
          ctx.clip();
        }

        // Apply rotation to the image content
        if (rotation !== 0) {
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        ctx.drawImage(image, x, y, width, height);
      }

      ctx.restore();
    });
  } else {
    // SCALED MODE: Stacks get progressively smaller
    Array.from({ length: numStacks }).forEach((_, i) => {
      const sizeFactor = map(
        i,
        0,
        numStacks - 1,
        config.sizeFactor.max,
        config.sizeFactor.min
      );
      const width = image.width * sizeFactor;
      const height = image.height * sizeFactor;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;

      // Calculate rotation based on mode
      let rotation = 0;
      if (rotationMode === 1 && i !== 0) {
        // Random rotation for each layer (except first)
        rotation = randomNumber(
          config.rotation.min,
          config.rotation.max,
          random
        );
      } else if (rotationMode === 2) {
        // Gradual rotation mapped from 0 to target
        rotation = map(i, 0, numStacks - 1, 0, targetRotation);
      }

      ctx.save();

      // Apply rotation if needed
      if (rotation !== 0) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      // First layer is not clipped, rest are circles
      if (i === 0) {
        ctx.drawImage(image, x, y, width, height);
      } else {
        ctx.beginPath();
        const radius = Math.min(width, height) / 2;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(image, x, y, width, height);
      }

      ctx.restore();
    });
  }

  ctx.restore();
};

export const subdivision = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height, random);

  // Random max recursion depth and skip probability
  const config = rendererConfig.subdivision;
  const maxDepth = randomNumber(
    config.maxDepth.min,
    config.maxDepth.max,
    random
  );
  const skipProbability = map(
    random(),
    0,
    1,
    config.skipProbability.min,
    config.skipProbability.max
  );

  // Collect all regions from subdivision
  const regions = [];

  // Recursive subdivision function to collect regions
  const subdivide = (x, y, width, height, depth) => {
    // Base case: max depth reached or area too small
    if (
      depth >= maxDepth ||
      width < config.minSize ||
      height < config.minSize
    ) {
      regions.push({ x, y, width, height });
      return;
    }

    // Random chance to skip subdivision (but not at depth 0 to ensure at least one subdivision)
    if (depth > 0 && random() < skipProbability) {
      regions.push({ x, y, width, height });
      return;
    }

    // Randomly choose split direction
    const splitHorizontal = random() < 0.5;

    if (splitHorizontal) {
      // Split horizontally at random point
      const splitPercent = map(
        random(),
        0,
        1,
        config.splitPercent.min,
        config.splitPercent.max
      );
      const splitHeight = height * splitPercent;

      // Recurse on both halves
      subdivide(x, y, width, splitHeight, depth + 1);
      subdivide(x, y + splitHeight, width, height - splitHeight, depth + 1);
    } else {
      // Split vertically at random point
      const splitPercent = map(
        random(),
        0,
        1,
        config.splitPercent.min,
        config.splitPercent.max
      );
      const splitWidth = width * splitPercent;

      // Recurse on both halves
      subdivide(x, y, splitWidth, height, depth + 1);
      subdivide(x + splitWidth, y, width - splitWidth, height, depth + 1);
    }
  };

  // Start subdivision from full canvas
  subdivide(0, 0, canvas.width, canvas.height, 0);

  // Draw each region with random flips
  regions.forEach((region) => {
    const flipH = random() < 0.5;
    const flipV = random() < 0.5;

    ctx.save();
    ctx.translate(region.x, region.y);

    // Apply flips if needed
    if (flipH || flipV) {
      if (flipH) {
        ctx.translate(region.width, 0);
        ctx.scale(-1, 1);
      }
      if (flipV) {
        ctx.translate(0, region.height);
        ctx.scale(1, -1);
      }
    }

    // Draw the region from the same position in the source image
    ctx.drawImage(
      image,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height
    );

    ctx.restore();
  });

  ctx.restore();
};
