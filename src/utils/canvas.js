import { randomNumber, createSeededRandom } from "./math.js";

/**
 * Shared setup for sync canvas renderers: sizes the canvas to the image,
 * draws it, and returns the 2D context plus a seeded RNG.
 * @returns {{ctx: CanvasRenderingContext2D, random: () => number}}
 */
export const setupRenderer = (canvas, image, seed) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = image.width;
  canvas.height = image.height;
  const random = createSeededRandom(seed);
  return { ctx, random };
};

/**
 * Calculates an adaptive pixel block size based on image dimensions.
 * Returns a value between 0.8% and 10% of the smaller dimension, clamped to 4-150px.
 * @param {number} width - The width of the image
 * @param {number} height - The height of the image
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {number} The calculated pixel block size
 */
export const calculateAdaptivePixelSize = (width, height, randomFn = Math.random) => {
  const baseDimension = Math.min(width, height);

  // Calculate percentage-based range (0.8% to 10% of smaller dimension)
  const minPercent = 0.008;
  const maxPercent = 0.1;

  const minSize = Math.floor(baseDimension * minPercent);
  const maxSize = Math.floor(baseDimension * maxPercent);

  const pixelSize = randomNumber(minSize, maxSize, randomFn);

  // Clamp to reasonable absolute bounds (4-150px)
  return Math.max(4, Math.min(150, pixelSize));
};

/**
 * Draws a halftone dot with various shape options.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {number} x - The X coordinate of the dot center
 * @param {number} y - The Y coordinate of the dot center
 * @param {number} radius - The radius of the dot
 * @param {string} shape - The shape type: 'circle', 'square', or 'diamond'
 * @param {{r: number, g: number, b: number}} color - The color to fill the dot
 */
export const drawHalftoneDot = (ctx, x, y, radius, shape, color) => {
  if (radius <= 0) return;

  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "square":
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      break;

    case "diamond":
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();
      break;

    default:
      // Default to circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
  }
};
