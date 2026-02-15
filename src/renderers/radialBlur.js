import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const radialBlur = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // White background to prevent dark transparent areas
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const random = createSeededRandom(seed);

  ctx.save();

  const config = rendererConfig.radialBlur;
  const numSamples = randomNumber(
    config.numSamples.min,
    config.numSamples.max,
    random
  );
  const blurStrength = map(
    random(),
    0,
    1,
    config.blurStrength.min,
    config.blurStrength.max
  );

  // Random center point
  const centerX =
    canvas.width *
    map(random(), 0, 1, config.centerVariation.min, config.centerVariation.max);
  const centerY =
    canvas.height *
    map(random(), 0, 1, config.centerVariation.min, config.centerVariation.max);

  // Draw multiple scaled versions with transparency
  for (let i = 0; i < numSamples; i++) {
    const scale = 1 + (i / numSamples) * blurStrength;
    const alpha = 1 / numSamples;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  ctx.restore();
};

radialBlur.displayName = rendererConfig.radialBlur.displayName;

export default radialBlur;
