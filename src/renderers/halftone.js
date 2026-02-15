import {
  createSeededRandom,
  randomNumber,
  extractDominantColors,
  calculateAdaptivePixelSize,
  getAverageColorInBlock,
  getLuminance,
  findNearestColor,
  drawHalftoneDot,
  applyBayerDithering,
  applyFloydSteinbergDithering,
} from "../utils/index.js";
import { rendererConfig } from "./config.js";

const halftone = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

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

halftone.displayName = rendererConfig.halftone.displayName;

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

halftoneBayer.displayName = rendererConfig.halftoneBayer.displayName;

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

halftoneClassicDots.displayName = rendererConfig.halftoneClassicDots.displayName;

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

halftoneFloydSteinberg.displayName = rendererConfig.halftoneFloydSteinberg.displayName;

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

halftoneLines.displayName = rendererConfig.halftoneLines.displayName;

export default halftone;
