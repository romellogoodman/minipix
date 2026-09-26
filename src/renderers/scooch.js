import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const scooch = ({ canvas, image, seed = Date.now(), config = rendererConfig.scooch }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const w = canvas.width;
  const h = canvas.height;

  // N alternating horizontal/vertical wrap-shifts compose into a single net
  // toroidal offset. Compute (dx, dy) then draw 4 quadrants — no pixel loops.
  const numScooches = randInt(config.numScooches, random);
  let isVertical = random() < 0.5;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < numScooches; i++) {
    const pct = randFloat(config.scoochPercent, random);
    if (isVertical) {
      dy += Math.floor(h * pct);
    } else {
      dx += Math.floor(w * pct);
    }
    isVertical = !isVertical;
  }

  dx = ((dx % w) + w) % w;
  dy = ((dy % h) + h) % h;

  // Source origin in image space that maps to canvas (0,0)
  const sx = dx;
  const sy = dy;
  const rw = w - sx;
  const rh = h - sy;

  if (rw > 0 && rh > 0) ctx.drawImage(image, sx, sy, rw, rh, 0, 0, rw, rh);
  if (sx > 0 && rh > 0) ctx.drawImage(image, 0, sy, sx, rh, rw, 0, sx, rh);
  if (rw > 0 && sy > 0) ctx.drawImage(image, sx, 0, rw, sy, 0, rh, rw, sy);
  if (sx > 0 && sy > 0) ctx.drawImage(image, 0, 0, sx, sy, rw, rh, sx, sy);
};

scooch.displayName = "scooch";

export default scooch;
