// Barrel for the sync (main-thread) renderers.
export { map, randomNumber, randInt, randFloat } from "./math.js";
export { setupRenderer, createCanvasLike, calculateAdaptivePixelSize, drawHalftoneDot } from "./canvas.js";
export {
  getAverageColorInBlock,
  shuffleArray,
  getLuminance,
  findNearestColor,
  extractDominantColors,
  applyBayerDithering,
  applyFloydSteinbergDithering,
} from "./image.js";
export { downsampleImage, computeOrientationField } from "./field.js";
