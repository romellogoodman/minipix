// Utility function to remap a number from one range to another
export const map = (value, start1, stop1, start2, stop2, withinBounds = false) => {
  const mapped = start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));

  if (!withinBounds) {
    return mapped;
  }

  if (start2 < stop2) {
    return Math.max(Math.min(mapped, stop2), start2);
  } else {
    return Math.max(Math.min(mapped, start2), stop2);
  }
};

// Utility function to generate a random integer between min and max (inclusive)
export const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to apply random flipping
export const applyRandomFlip = (ctx, width, height) => {
  const flipX = Math.random() < 0.5;
  const flipY = Math.random() < 0.5;

  if (flipX || flipY) {
    ctx.translate(flipX ? width : 0, flipY ? height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }

  return { flipX, flipY };
};

// Helper function to calculate adaptive pixel block size based on image dimensions
export const calculateAdaptivePixelSize = (width, height) => {
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
export const getAverageColorInBlock = (
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
