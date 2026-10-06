import { randomNumber, createSeededRandom } from "./math.js";

// Shared setup for sync renderers: sizes the canvas to the image and returns
// its 2D context plus a seeded RNG. Renderers draw the image themselves.
export const setupRenderer = (canvas, image, seed) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = image.width;
  canvas.height = image.height;
  const random = createSeededRandom(seed);
  return { ctx, random };
};

// A blank canvas of the given size, of the same kind as `like`: a DOM canvas
// in the browser, a node-canvas Canvas in the CLI. For scratch layers.
export const createCanvasLike = (like, width, height) => {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  return new like.constructor(width, height);
};

// Random block size between 0.8% and 10% of the shorter side, clamped to 4–150px.
export const calculateAdaptivePixelSize = (width, height, randomFn = Math.random) => {
  const baseDimension = Math.min(width, height);
  const minSize = Math.floor(baseDimension * 0.008);
  const maxSize = Math.floor(baseDimension * 0.1);
  const pixelSize = randomNumber(minSize, maxSize, randomFn);
  return Math.max(4, Math.min(150, pixelSize));
};

// Fills a halftone dot: "square", "diamond", or (default) circle.
export const drawHalftoneDot = (ctx, x, y, radius, shape, color) => {
  if (radius <= 0) return;

  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;

  switch (shape) {
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
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
  }
};
