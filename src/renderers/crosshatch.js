import {
  createSeededRandom,
  randomNumber,
  extractDominantColors,
  getLuminance,
  getAverageColorInBlock,
  findNearestColor,
} from "../utils/index.js";
import { rendererConfig } from "./config.js";

const crosshatch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const random = createSeededRandom(seed);

  ctx.save();

  // Draw image to get pixel data
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const config = rendererConfig.crosshatch;
  const numColors = randomNumber(
    config.numColors.min,
    config.numColors.max,
    random
  );
  const palette = extractDominantColors(imageData, numColors, 10);
  const lineSpacing = randomNumber(
    config.lineSpacing.min,
    config.lineSpacing.max,
    random
  );
  const lineLength = randomNumber(
    config.lineLength.min,
    config.lineLength.max,
    random
  );
  const strokeWidth = randomNumber(
    config.strokeWidth.min,
    config.strokeWidth.max,
    random
  );

  // Fill with lightest color from palette
  const sortedPalette = [...palette].sort(
    (a, b) => getLuminance(b.r, b.g, b.b) - getLuminance(a.r, a.g, a.b)
  );
  ctx.fillStyle = `rgb(${sortedPalette[0].r}, ${sortedPalette[0].g}, ${sortedPalette[0].b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";

  // Pre-compute block averages in a grid to avoid redundant calculations
  const gridCols = Math.ceil(canvas.width / lineSpacing);
  const gridRows = Math.ceil(canvas.height / lineSpacing);
  const blockCache = new Array(gridRows);

  for (let row = 0; row < gridRows; row++) {
    blockCache[row] = new Array(gridCols);
    for (let col = 0; col < gridCols; col++) {
      const x = col * lineSpacing;
      const y = row * lineSpacing;
      const avgColor = getAverageColorInBlock(
        imageData,
        x,
        y,
        lineSpacing,
        canvas.width,
        canvas.height
      );
      const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
      const nearestColor = findNearestColor(avgColor, palette);
      blockCache[row][col] = { avgColor, luminance, nearestColor };
    }
  }

  // Draw crosshatch strokes based on cached luminance
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const x = col * lineSpacing;
      const y = row * lineSpacing;
      const { luminance, nearestColor } = blockCache[row][col];

      ctx.strokeStyle = `rgb(${nearestColor.r}, ${nearestColor.g}, ${nearestColor.b})`;

      // More strokes for darker areas
      const numStrokes = Math.floor((1 - luminance) * 4);

      for (let s = 0; s < numStrokes; s++) {
        const angle = (s * Math.PI) / 4 + (random() - 0.5) * 0.3;
        const cx = x + lineSpacing / 2 + (random() - 0.5) * lineSpacing * 0.5;
        const cy = y + lineSpacing / 2 + (random() - 0.5) * lineSpacing * 0.5;
        const len = lineLength * (0.5 + random() * 0.5);

        ctx.beginPath();
        ctx.moveTo(
          cx - (Math.cos(angle) * len) / 2,
          cy - (Math.sin(angle) * len) / 2
        );
        ctx.lineTo(
          cx + (Math.cos(angle) * len) / 2,
          cy + (Math.sin(angle) * len) / 2
        );
        ctx.stroke();
      }
    }
  }

  ctx.restore();
};

crosshatch.displayName = "crosshatch";

export default crosshatch;
