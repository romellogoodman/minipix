import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

/**
 * Temporal-decay trails for a still image: the picture is re-drawn as a
 * series of discrete ghosts, each stepped further along a translation (and
 * optionally rotated / scaled about a pivot) and weighted by decay^k, so it
 * reads like stacked frames of a strobe photograph rather than a continuous
 * blur.
 */
const echo = ({ canvas, image, seed = Date.now(), config = rendererConfig.echo }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const { width, height } = canvas;
  const shortSide = Math.min(width, height);

  const numCopies = randInt(config.numCopies, random);
  const step = shortSide * randFloat(config.stepPercent, random);
  const angle = random() * Math.PI * 2;
  const rotate = random() < config.rotateProbability;
  const rotationStep = (randFloat(config.rotationStep, random) * Math.PI) / 180 * (random() < 0.5 ? -1 : 1);
  const zoom = random() < config.zoomProbability;
  const scaleStep = randFloat(config.scaleStep, random) * (random() < 0.5 ? -1 : 1);
  const decay = randFloat(config.decay, random);
  const mirror = random() < config.mirrorProbability;
  const pivotX = width * (0.3 + random() * 0.4);
  const pivotY = height * (0.3 + random() * 0.4);

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  // Opaque original first, counted as weight 1 in the running average.
  ctx.drawImage(image, 0, 0);
  let weightSum = 1;

  for (let k = 1; k <= numCopies; k++) {
    const weight = Math.pow(decay, k);
    for (let side = 0; side < (mirror ? 2 : 1); side++) {
      const dir = side === 0 ? 1 : -1;
      weightSum += weight;
      ctx.globalAlpha = weight / weightSum;

      const ox = dirX * step * k * dir;
      const oy = dirY * step * k * dir;
      const theta = rotate ? rotationStep * k * dir : 0;
      const scale = zoom ? Math.max(0.05, 1 + scaleStep * k * dir) : 1;
      const a = Math.cos(theta) * scale;
      const b = Math.sin(theta) * scale;
      ctx.setTransform(
        a,
        b,
        -b,
        a,
        pivotX - (a * pivotX - b * pivotY) + ox,
        pivotY - (b * pivotX + a * pivotY) + oy
      );
      ctx.drawImage(image, 0, 0);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};

echo.displayName = "echo";

export default echo;
