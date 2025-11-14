import { map, randomNumber } from "./utils";

// Helper function to apply random flipping
const applyRandomFlip = (ctx, width, height) => {
  const flipX = Math.random() < 0.5;
  const flipY = Math.random() < 0.5;

  if (flipX || flipY) {
    ctx.translate(flipX ? width : 0, flipY ? height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }

  return { flipX, flipY };
};

export const renderImage = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyRandomFlip(ctx, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  ctx.restore();
};

export const renderImageStacked = ({ canvas, image }) => {
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

export const renderImageStackedCircle = ({ canvas, image }) => {
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

// Helper function to calculate adaptive pixel block size based on image dimensions
const calculateAdaptivePixelSize = (width, height) => {
  const baseDimension = Math.min(width, height);

  // Calculate percentage-based range (0.8% to 10% of smaller dimension)
  const minPercent = 0.008;
  const maxPercent = 0.1;

  const minSize = Math.floor(baseDimension * minPercent);
  const maxSize = Math.floor(baseDimension * maxPercent);

  const pixelSize = randomNumber(minSize, maxSize);

  // Clamp to reasonable absolute bounds (4-150px)
  return Math.max(4, Math.min(150, pixelSize));
};

// Helper function to calculate average color of all pixels in a block
const getAverageColorInBlock = (
  imageData,
  startX,
  startY,
  blockSize,
  imageWidth,
  imageHeight
) => {
  let r = 0,
    g = 0,
    b = 0,
    count = 0;

  // Calculate actual block boundaries (handle edge cases)
  const endX = Math.min(startX + blockSize, imageWidth);
  const endY = Math.min(startY + blockSize, imageHeight);

  // Sum all pixel values in the block
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (y * imageWidth + x) * 4;
      r += imageData.data[index];
      g += imageData.data[index + 1];
      b += imageData.data[index + 2];
      count++;
    }
  }

  // Return average color
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
};

export const renderImagePixelated = ({ canvas, image }) => {
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

