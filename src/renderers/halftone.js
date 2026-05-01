import {
  setupRenderer,
  randInt,
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

const MODES = ["bayer", "floydSteinberg", "classicDots", "lines"];
const SHAPES = ["circle", "square", "diamond"];

function renderHalftone({ canvas, image, seed = Date.now() }, forcedMode) {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const config = rendererConfig.halftone;

  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const numColors = randInt(config.numColors, random);
  const palette = extractDominantColors(imageData, numColors, 10);
  const mode = forcedMode || MODES[randInt({ min: 0, max: MODES.length - 1 }, random)];

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  switch (mode) {
    case "bayer": {
      ctx.putImageData(applyBayerDithering(imageData, palette), 0, 0);
      break;
    }

    case "floydSteinberg": {
      ctx.putImageData(applyFloydSteinbergDithering(imageData, palette), 0, 0);
      break;
    }

    case "classicDots": {
      const adaptiveSize = calculateAdaptivePixelSize(image.width, image.height, random);
      const { min, max } = config.classicDots.blockSize;
      const blockSize = Math.min(max, Math.max(min, adaptiveSize));
      const shape = SHAPES[Math.floor(random() * SHAPES.length)];

      for (let y = 0; y < canvas.height; y += blockSize) {
        for (let x = 0; x < canvas.width; x += blockSize) {
          const avgColor = getAverageColorInBlock(imageData, x, y, blockSize, canvas.width, canvas.height);
          const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
          const nearestColor = findNearestColor(avgColor, palette);
          const dotRadius = (1 - luminance) * blockSize * 0.45;
          drawHalftoneDot(ctx, x + blockSize / 2, y + blockSize / 2, dotRadius, shape, nearestColor);
        }
      }
      break;
    }

    case "lines": {
      const adaptiveSize = calculateAdaptivePixelSize(image.width, image.height, random);
      const { min, max } = config.lines.blockSize;
      const blockSize = Math.min(max, Math.max(min, adaptiveSize));
      const horizontal = random() < 0.5;

      for (let y = 0; y < canvas.height; y += blockSize) {
        for (let x = 0; x < canvas.width; x += blockSize) {
          const avgColor = getAverageColorInBlock(imageData, x, y, blockSize, canvas.width, canvas.height);
          const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
          const nearestColor = findNearestColor(avgColor, palette);
          const lineWeight = (1 - luminance) * blockSize * config.lines.lineWeightMultiplier;

          ctx.fillStyle = `rgb(${nearestColor.r}, ${nearestColor.g}, ${nearestColor.b})`;
          if (horizontal) {
            ctx.fillRect(x, y + (blockSize - lineWeight) / 2, blockSize, lineWeight);
          } else {
            ctx.fillRect(x + (blockSize - lineWeight) / 2, y, lineWeight, blockSize);
          }
        }
      }
      break;
    }
  }
}

const halftone = (args) => renderHalftone(args);
halftone.displayName = "halftone";

const makeVariant = (mode, displayName) => {
  const fn = (args) => renderHalftone(args, mode);
  fn.displayName = displayName;
  return fn;
};

export const halftoneBayer = makeVariant("bayer", "halftoneBayer");
export const halftoneClassicDots = makeVariant("classicDots", "halftoneClassicDots");
export const halftoneFloydSteinberg = makeVariant("floydSteinberg", "halftoneFloydSteinberg");
export const halftoneLines = makeVariant("lines", "halftoneLines");

export default halftone;
