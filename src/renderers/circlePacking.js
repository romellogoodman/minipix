import { setupRenderer, randInt, extractDominantColors, getLuminance } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const circlePacking = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const config = rendererConfig.circlePacking;

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const palette = extractDominantColors(src, 4);
  const bg = palette.reduce((a, b) =>
    getLuminance(a.r, a.g, a.b) < getLuminance(b.r, b.g, b.b) ? a : b
  );
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const shortSide = Math.min(canvas.width, canvas.height);
  const minR = Math.max(2, shortSide * config.minRadiusPercent);
  const maxR = shortSide * config.maxRadiusPercent;
  const attempts = randInt(config.attempts, random);
  const padding = config.padding;

  // Spatial hash grid for overlap checks — cell size = maxR so each circle
  // touches at most the 3×3 neighborhood.
  const gridSize = maxR;
  const gridCols = Math.ceil(canvas.width / gridSize);
  const grid = new Map();
  const key = (x, y) => Math.floor(y / gridSize) * gridCols + Math.floor(x / gridSize);

  const fitRadius = (x, y) => {
    let r = Math.min(maxR, x, y, canvas.width - x, canvas.height - y);
    const k = key(x, y);
    const col = k % gridCols;
    const row = (k - col) / gridCols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const bucket = grid.get((row + dr) * gridCols + (col + dc));
        if (!bucket) continue;
        for (const c of bucket) {
          const d = Math.hypot(x - c.x, y - c.y) - c.r - padding;
          if (d < r) r = d;
          if (r < minR) return 0;
        }
      }
    }
    return r;
  };

  for (let i = 0; i < attempts; i++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const r = fitRadius(x, y);
    if (r < minR) continue;

    const sx = Math.floor(x), sy = Math.floor(y);
    const idx = (sy * canvas.width + sx) * 4;
    ctx.fillStyle = `rgb(${src.data[idx]},${src.data[idx + 1]},${src.data[idx + 2]})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    const k = key(x, y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ x, y, r });
  }
};

circlePacking.displayName = "circlePacking";
export default circlePacking;
