import { setupRenderer, randInt, getLuminance, getAverageColorInBlock, extractDominantColors } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const RAMPS = [
  " .:-=+*#%@",
  " ░▒▓█",
  " ·•●",
  " ▁▂▃▄▅▆▇█",
];

const asciiMosaic = ({ canvas, image, seed = Date.now(), config = rendererConfig.asciiMosaic }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const shortSide = Math.min(canvas.width, canvas.height);
  const cols = randInt(config.cols, random);
  const cellW = Math.max(3, Math.round(shortSide / cols));
  const cellH = Math.round(cellW * 1.6);

  const chars = [...RAMPS[Math.floor(random() * RAMPS.length)]];
  const rampLen = chars.length;

  const palette = extractDominantColors(src, 4);
  const bg = palette.reduce((a, b) =>
    getLuminance(a.r, a.g, a.b) < getLuminance(b.r, b.g, b.b) ? a : b
  );
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `${cellH}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "top";

  for (let y = 0; y < canvas.height; y += cellH) {
    for (let x = 0; x < canvas.width; x += cellW) {
      const c = getAverageColorInBlock(src, x, y, cellW, canvas.width, canvas.height, cellH);
      const lum = getLuminance(c.r, c.g, c.b);
      const ch = chars[Math.min(rampLen - 1, Math.floor(lum * rampLen))];
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillText(ch, x, y);
    }
  }
};

asciiMosaic.displayName = "asciiMosaic";

export default asciiMosaic;
