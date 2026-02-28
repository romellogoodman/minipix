import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const scooch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  const config = rendererConfig.scooch;

  // Random number of scooches
  const numScooches = randomNumber(
    config.numScooches.min,
    config.numScooches.max,
    random
  );

  // Randomly choose starting direction: horizontal (0) or vertical (1)
  let isVertical = random() < 0.5;

  // Draw the original image to canvas first
  ctx.drawImage(image, 0, 0);

  // Use ImageData for efficient pixel manipulation (avoids creating temp DOM elements)
  let currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);

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

    const nextData = ctx.createImageData(canvas.width, canvas.height);
    const src = currentData.data;
    const dst = nextData.data;
    const w = canvas.width;
    const h = canvas.height;

    if (isVertical) {
      // Vertical scooch - move top slice to bottom
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Calculate source y position (wrap around)
          const srcY = (y + scoochAmount) % h;
          const srcIdx = (srcY * w + x) * 4;
          const dstIdx = (y * w + x) * 4;

          dst[dstIdx] = src[srcIdx];
          dst[dstIdx + 1] = src[srcIdx + 1];
          dst[dstIdx + 2] = src[srcIdx + 2];
          dst[dstIdx + 3] = src[srcIdx + 3];
        }
      }
    } else {
      // Horizontal scooch - move left slice to right
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Calculate source x position (wrap around)
          const srcX = (x + scoochAmount) % w;
          const srcIdx = (y * w + srcX) * 4;
          const dstIdx = (y * w + x) * 4;

          dst[dstIdx] = src[srcIdx];
          dst[dstIdx + 1] = src[srcIdx + 1];
          dst[dstIdx + 2] = src[srcIdx + 2];
          dst[dstIdx + 3] = src[srcIdx + 3];
        }
      }
    }

    currentData = nextData;

    // Alternate direction for next iteration
    isVertical = !isVertical;
  }

  // Draw final result to main canvas
  ctx.putImageData(currentData, 0, 0);

  ctx.restore();
};

scooch.displayName = "scooch";

export default scooch;
