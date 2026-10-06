import { setupRenderer, randInt, randFloat, createCanvasLike } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const radialBlur = ({ canvas, image, seed = Date.now(), config = rendererConfig.radialBlur }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const numSamples = randInt(config.numSamples, random);
  const blurStrength = randFloat(config.blurStrength, random);
  const centerX = canvas.width * randFloat(config.centerVariation, random);
  const centerY = canvas.height * randFloat(config.centerVariation, random);

  // Zoom blur by repeated self-compositing: each pass averages the canvas
  // with a copy of itself scaled about the centre, doubling the number of
  // zoom samples. log2(numSamples) full-canvas draws stand in for
  // numSamples; the samples span the same scale range (1 .. the last
  // original sample) but are spaced geometrically instead of linearly.
  const passes = Math.max(1, Math.ceil(Math.log2(numSamples)));
  const maxScale = 1 + ((numSamples - 1) / numSamples) * blurStrength;
  const stepScale = Math.pow(maxScale, 1 / (2 ** passes - 1));

  // Ping-pong between the output and one scratch canvas.
  const scratch = createCanvasLike(canvas, canvas.width, canvas.height);
  const sctx = scratch.getContext("2d");
  let src = canvas;
  let dst = scratch;
  let dctx = sctx;
  ctx.drawImage(image, 0, 0);
  let scale = stepScale;
  for (let p = 0; p < passes; p++) {
    dctx.globalAlpha = 1;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.drawImage(src, 0, 0);
    dctx.globalAlpha = 0.5;
    dctx.setTransform(scale, 0, 0, scale, centerX * (1 - scale), centerY * (1 - scale));
    dctx.drawImage(src, 0, 0);
    scale *= scale;
    [src, dst] = [dst, src];
    dctx = dst === canvas ? ctx : sctx;
  }
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalAlpha = 1;
  if (src !== canvas) ctx.drawImage(src, 0, 0);
};

radialBlur.displayName = "radialBlur";

export default radialBlur;
