import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const subdivision = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

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

subdivision.displayName = rendererConfig.subdivision.displayName;

export default subdivision;
