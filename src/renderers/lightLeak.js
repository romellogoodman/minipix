import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const PALETTE = ["#ff6b35", "#f7931e", "#ff1744", "#ff4081", "#ffd54f", "#ff8a65"];

const lightLeak = ({ canvas, image, seed = Date.now(), config = rendererConfig.lightLeak }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  ctx.drawImage(image, 0, 0);

  const diag = Math.hypot(canvas.width, canvas.height);
  const numLeaks = randInt(config.numLeaks, random);

  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < numLeaks; i++) {
    // Anchor on a random edge
    const edge = Math.floor(random() * 4);
    const t = random();
    const cx = edge === 1 ? canvas.width : edge === 3 ? 0 : t * canvas.width;
    const cy = edge === 2 ? canvas.height : edge === 0 ? 0 : t * canvas.height;

    const radius = diag * randFloat(config.radiusPercent, random);
    const color = PALETTE[Math.floor(random() * PALETTE.length)];

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(randFloat(config.falloff, random), color + "80");
    grad.addColorStop(1, color + "00");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.globalCompositeOperation = "source-over";
};

lightLeak.displayName = "lightLeak";

export default lightLeak;
