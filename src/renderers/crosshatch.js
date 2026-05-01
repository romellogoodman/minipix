import {
  setupRenderer,
  randInt,
  randFloat,
  extractDominantColors,
  getLuminance,
  getAverageColorInBlock,
  findNearestColor,
} from "../utils/index.js";
import { rendererConfig } from "./config.js";

const crosshatch = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const config = rendererConfig.crosshatch;
  const shortSide = Math.min(canvas.width, canvas.height);
  const numColors = randInt(config.numColors, random);
  const palette = extractDominantColors(imageData, numColors, 10);
  const lineSpacing = Math.max(2, Math.round(shortSide * randFloat(config.lineSpacingPercent, random)));
  const lineLength = Math.round(shortSide * randFloat(config.lineLengthPercent, random));
  const strokeWidth = Math.max(1, Math.round(lineSpacing * 0.2));

  // Fill with lightest palette color
  const sortedPalette = [...palette].sort(
    (a, b) => getLuminance(b.r, b.g, b.b) - getLuminance(a.r, a.g, a.b)
  );
  ctx.fillStyle = `rgb(${sortedPalette[0].r}, ${sortedPalette[0].g}, ${sortedPalette[0].b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";

  // Batch strokes by palette color so each color is one beginPath/stroke.
  const batches = new Map(palette.map((c) => [c, []]));

  for (let y = 0; y < canvas.height; y += lineSpacing) {
    for (let x = 0; x < canvas.width; x += lineSpacing) {
      const avgColor = getAverageColorInBlock(imageData, x, y, lineSpacing, canvas.width, canvas.height);
      const luminance = getLuminance(avgColor.r, avgColor.g, avgColor.b);
      const nearestColor = findNearestColor(avgColor, palette);
      const numStrokes = Math.min(4, Math.floor((1 - luminance) * 5));
      const lines = batches.get(nearestColor);

      for (let s = 0; s < numStrokes; s++) {
        const angle = (s * Math.PI) / 4 + (random() - 0.5) * 0.3;
        const cx = x + lineSpacing / 2 + (random() - 0.5) * lineSpacing * 0.5;
        const cy = y + lineSpacing / 2 + (random() - 0.5) * lineSpacing * 0.5;
        const halfLen = (lineLength * (0.5 + random() * 0.5)) / 2;
        const cos = Math.cos(angle) * halfLen;
        const sin = Math.sin(angle) * halfLen;
        lines.push(cx - cos, cy - sin, cx + cos, cy + sin);
      }
    }
  }

  for (const [color, lines] of batches) {
    if (lines.length === 0) continue;
    ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.beginPath();
    for (let i = 0; i < lines.length; i += 4) {
      ctx.moveTo(lines[i], lines[i + 1]);
      ctx.lineTo(lines[i + 2], lines[i + 3]);
    }
    ctx.stroke();
  }
};

crosshatch.displayName = "crosshatch";

export default crosshatch;
