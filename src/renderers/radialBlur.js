import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const radialBlur = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const config = rendererConfig.radialBlur;
  const numSamples = randInt(config.numSamples, random);
  const blurStrength = randFloat(config.blurStrength, random);
  const centerX = canvas.width * randFloat(config.centerVariation, random);
  const centerY = canvas.height * randFloat(config.centerVariation, random);

  for (let i = 0; i < numSamples; i++) {
    const scale = 1 + (i / numSamples) * blurStrength;
    // Running average: after i+1 draws each sample contributes exactly 1/(i+1).
    ctx.globalAlpha = 1 / (i + 1);
    ctx.setTransform(scale, 0, 0, scale, centerX * (1 - scale), centerY * (1 - scale));
    ctx.drawImage(image, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};

radialBlur.displayName = "radialBlur";

export default radialBlur;
