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
  generatePoissonDiskPoints,
} from "./utils";

export const renderBarSwap = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Randomly choose direction: horizontal (0) or vertical (1)
  const isVertical = Math.random() < 0.5;

  // Random number of bars (8-16)
  const numBars = randomNumber(8, 16);

  // Create array of bar indices and shuffle them
  const barIndices = Array.from({ length: numBars }, (_, i) => i);
  const shuffledIndices = shuffleArray(barIndices);

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

export const renderGridSwap = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Calculate aspect ratio and adapt grid accordingly
  const aspectRatio = canvas.width / canvas.height;
  const baseGridSize = randomNumber(3, 6);

  let columns, rows;

  if (aspectRatio > 1.5) {
    // Wide/landscape image - more columns than rows
    columns = baseGridSize + randomNumber(1, 3);
    rows = baseGridSize;
  } else if (aspectRatio < 0.67) {
    // Tall/portrait image - more rows than columns
    columns = baseGridSize;
    rows = baseGridSize + randomNumber(1, 3);
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
  const shuffledIndices = shuffleArray(cellIndices);

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

export const renderPixelated = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Draw original image to canvas so we can read pixel data
  ctx.drawImage(image, 0, 0, image.width, image.height);

  // Get image data for color sampling
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Calculate adaptive block size based on image dimensions
  const blockSize = calculateAdaptivePixelSize(image.width, image.height);

  // Process each block in the grid
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
      ctx.fillStyle = `rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})`;
      ctx.fillRect(x, y, blockSize, blockSize);
    }
  }

  ctx.restore();
};

export const renderScooch = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Randomly choose direction: horizontal (0) or vertical (1)
  const isVertical = Math.random() < 0.5;

  // Calculate scooch amount (5-30% of relevant dimension)
  const scoochPercent = map(Math.random(), 0, 1, 0.05, 0.3);
  const scoochAmount = isVertical
    ? Math.floor(canvas.height * scoochPercent)
    : Math.floor(canvas.width * scoochPercent);

  if (isVertical) {
    // Vertical scooch - move top slice to bottom
    // Draw the slice from top (moves to bottom)
    ctx.drawImage(
      image,
      0,
      0, // source x, y
      image.width,
      scoochAmount, // source width, height
      0,
      canvas.height - scoochAmount, // dest x, y
      canvas.width,
      scoochAmount // dest width, height
    );

    // Draw the rest of the image (moves to top)
    ctx.drawImage(
      image,
      0,
      scoochAmount, // source x, y
      image.width,
      image.height - scoochAmount, // source width, height
      0,
      0, // dest x, y
      canvas.width,
      canvas.height - scoochAmount // dest width, height
    );
  } else {
    // Horizontal scooch - move left slice to right
    // Draw the slice from left (moves to right)
    ctx.drawImage(
      image,
      0,
      0, // source x, y
      scoochAmount,
      image.height, // source width, height
      canvas.width - scoochAmount,
      0, // dest x, y
      scoochAmount,
      canvas.height // dest width, height
    );

    // Draw the rest of the image (moves to left)
    ctx.drawImage(
      image,
      scoochAmount,
      0, // source x, y
      image.width - scoochAmount,
      image.height, // source width, height
      0,
      0, // dest x, y
      canvas.width - scoochAmount,
      canvas.height // dest width, height
    );
  }

  ctx.restore();
};

export const renderStacked = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Random number of stacks between 4 and 12
  const numStacks = randomNumber(4, 12);

  // Create stacks with sizes mapped from 100% down to 25%
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(i, 0, numStacks - 1, 1, 0.25);
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  });

  ctx.restore();
};

export const renderStackedCircle = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Random number of stacks between 4 and 12
  const numStacks = randomNumber(4, 12);

  // Randomly choose rotation mode: 0 = none, 1 = random, 2 = gradual
  const rotationMode = Math.floor(Math.random() * 3);
  const targetRotation = rotationMode === 2 ? randomNumber(-180, 180) : 0;

  // Create stacks with sizes mapped from 100% down to 25%
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(i, 0, numStacks - 1, 1, 0.25);
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    // Calculate rotation based on mode
    let rotation = 0;
    if (rotationMode === 1 && i !== 0) {
      // Random rotation for each layer (except first)
      rotation = randomNumber(-180, 180);
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

  ctx.restore();
};

export const renderSubdivision = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Random max recursion depth (3-5 levels)
  const maxDepth = randomNumber(3, 5);
  // Random skip probability (30-60%)
  const skipProbability = map(Math.random(), 0, 1, 0.3, 0.6);

  // Recursive subdivision function
  const subdivide = (x, y, width, height, depth) => {
    // Base case: max depth reached or area too small
    if (depth >= maxDepth || width < 20 || height < 20) {
      // Draw this region
      ctx.drawImage(image, x, y, width, height, x, y, width, height);
      return;
    }

    // Random chance to skip subdivision and just draw
    if (Math.random() < skipProbability) {
      ctx.drawImage(image, x, y, width, height, x, y, width, height);
      return;
    }

    // Randomly choose split direction
    const splitHorizontal = Math.random() < 0.5;

    if (splitHorizontal) {
      // Split horizontally at random point (30-70%)
      const splitPercent = map(Math.random(), 0, 1, 0.3, 0.7);
      const splitHeight = height * splitPercent;

      // Recurse on both halves
      subdivide(x, y, width, splitHeight, depth + 1);
      subdivide(x, y + splitHeight, width, height - splitHeight, depth + 1);
    } else {
      // Split vertically at random point (30-70%)
      const splitPercent = map(Math.random(), 0, 1, 0.3, 0.7);
      const splitWidth = width * splitPercent;

      // Recurse on both halves
      subdivide(x, y, splitWidth, height, depth + 1);
      subdivide(x + splitWidth, y, width - splitWidth, height, depth + 1);
    }
  };

  // Start subdivision from full canvas
  subdivide(0, 0, canvas.width, canvas.height, 0);

  ctx.restore();
};

// export const renderChromaticShift = ({ canvas, image }) => {
//   if (!image) return;

//   const ctx = canvas.getContext("2d");

//   // Set canvas to original image dimensions
//   canvas.width = image.width;
//   canvas.height = image.height;

//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   ctx.save();
//   applyRandomFlip(ctx, canvas.width, canvas.height);

//   // Draw original image to get pixel data
//   ctx.drawImage(image, 0, 0, image.width, image.height);
//   const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

//   // Random offset amounts for each channel (5-20 pixels)
//   const rOffsetX = randomNumber(-20, 20);
//   const rOffsetY = randomNumber(-20, 20);
//   const gOffsetX = randomNumber(-20, 20);
//   const gOffsetY = randomNumber(-20, 20);
//   const bOffsetX = randomNumber(-20, 20);
//   const bOffsetY = randomNumber(-20, 20);

//   // Create separate channel image data
//   const rData = ctx.createImageData(canvas.width, canvas.height);
//   const gData = ctx.createImageData(canvas.width, canvas.height);
//   const bData = ctx.createImageData(canvas.width, canvas.height);

//   // Separate channels
//   for (let y = 0; y < canvas.height; y++) {
//     for (let x = 0; x < canvas.width; x++) {
//       const i = (y * canvas.width + x) * 4;

//       // Red channel
//       rData.data[i] = imageData.data[i];
//       rData.data[i + 1] = 0;
//       rData.data[i + 2] = 0;
//       rData.data[i + 3] = imageData.data[i + 3];

//       // Green channel
//       gData.data[i] = 0;
//       gData.data[i + 1] = imageData.data[i + 1];
//       gData.data[i + 2] = 0;
//       gData.data[i + 3] = imageData.data[i + 3];

//       // Blue channel
//       bData.data[i] = 0;
//       bData.data[i + 1] = 0;
//       bData.data[i + 2] = imageData.data[i + 2];
//       bData.data[i + 3] = imageData.data[i + 3];
//     }
//   }

//   // Clear canvas
//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   // Set blend mode for color addition
//   ctx.globalCompositeOperation = "lighter";

//   // Draw red channel with offset
//   ctx.putImageData(rData, rOffsetX, rOffsetY);

//   // Draw green channel with offset
//   ctx.putImageData(gData, gOffsetX, gOffsetY);

//   // Draw blue channel with offset
//   ctx.putImageData(bData, bOffsetX, bOffsetY);

//   // Reset blend mode
//   ctx.globalCompositeOperation = "source-over";

//   ctx.restore();
// };

// export const renderKaleidoscope = ({ canvas, image }) => {
//   if (!image) return;

//   const ctx = canvas.getContext("2d");

//   // Set canvas to original image dimensions
//   canvas.width = image.width;
//   canvas.height = image.height;

//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   ctx.save();
//   applyRandomFlip(ctx, canvas.width, canvas.height);

//   // Random number of wedges (4-8)
//   const numWedges = randomNumber(4, 8);
//   const wedgeAngle = (Math.PI * 2) / numWedges;

//   const centerX = canvas.width / 2;
//   const centerY = canvas.height / 2;

//   // Draw each wedge
//   for (let i = 0; i < numWedges; i++) {
//     ctx.save();

//     // Translate to center
//     ctx.translate(centerX, centerY);

//     // Rotate to wedge position
//     ctx.rotate(i * wedgeAngle);

//     // Random flip for variation
//     if (Math.random() < 0.5) {
//       ctx.scale(-1, 1);
//     }

//     // Clip to wedge shape
//     ctx.beginPath();
//     ctx.moveTo(0, 0);
//     ctx.arc(0, 0, Math.max(canvas.width, canvas.height), 0, wedgeAngle);
//     ctx.lineTo(0, 0);
//     ctx.clip();

//     // Draw image centered
//     ctx.drawImage(
//       image,
//       -canvas.width / 2,
//       -canvas.height / 2,
//       canvas.width,
//       canvas.height
//     );

//     ctx.restore();
//   }

//   ctx.restore();
// };

export const renderHalftone = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);

  // Draw image to get imageData
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Random number of colors (2-6)
  const numColors = randomNumber(2, 6);

  // Extract dominant colors from the image
  const palette = extractDominantColors(imageData, numColors, 10);

  // Randomly select halftone mode
  const modes = ["bayer", "floydSteinberg", "classicDots", "lines"];
  const mode = modes[randomNumber(0, modes.length - 1)];

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
      const blockSize = Math.max(
        6,
        calculateAdaptivePixelSize(image.width, image.height) * 0.5
      );
      const shape = ["circle", "square", "diamond"][randomNumber(0, 2)];

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
      const blockSize = calculateAdaptivePixelSize(image.width, image.height);
      const orientation = ["horizontal", "vertical"][randomNumber(0, 1)];

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

          const lineWeight = (1 - luminance) * blockSize * 0.9;

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
