import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

/**
 * Motion smear: the image is drawn many times along a trajectory — a
 * straight or curved slide, or a rotation about a pivot — and averaged with
 * a raised-cosine "shutter" weighting (0.5 * (1 - cos 2πt)), so the trail
 * fades in and out softly instead of ending in a hard edge the way uniform
 * averaging would. Reads like a long exposure of a moving frame.
 */
const smear = ({ canvas, image, seed = Date.now(), config = rendererConfig.smear }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const { width, height } = canvas;
  const shortSide = Math.min(width, height);

  const numSamples = randInt(config.numSamples, random);
  const distance = shortSide * randFloat(config.distancePercent, random);
  const angle = random() * Math.PI * 2;
  const rotate = random() < config.rotateProbability;
  const rotation = (randFloat(config.rotation, random) * Math.PI) / 180 * (random() < 0.5 ? -1 : 1);
  const curved = random() < config.curveProbability;
  const bend = (random() - 0.5) * distance * 1.5;
  const pivotX = width * (0.25 + random() * 0.5);
  const pivotY = height * (0.25 + random() * 0.5);
  const sharpness = randFloat(config.sharpness, random);

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -dirY;
  const perpY = dirX;

  // Shutter weights up front so the sharp base copy can be given a fixed
  // share (`sharpness`) of the final average.
  const weights = new Float32Array(numSamples);
  let smearWeight = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = (i + 0.5) / numSamples;
    weights[i] = 0.5 * (1 - Math.cos(2 * Math.PI * t));
    smearWeight += weights[i];
  }

  // Opaque base at identity so uncovered strips never go transparent; it
  // counts as the first sample of the running average.
  ctx.drawImage(image, 0, 0);
  let weightSum = Math.max(1e-3, (smearWeight * sharpness) / (1 - sharpness));

  for (let i = 0; i < numSamples; i++) {
    const t = (i + 0.5) / numSamples;
    const weight = weights[i];
    weightSum += weight;
    // Running average: after this draw each sample contributes weight / sum.
    ctx.globalAlpha = weight / weightSum;
    const u = t - 0.5; // -0.5 .. 0.5, identity at the middle

    if (rotate) {
      const theta = rotation * u;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      ctx.setTransform(
        cos,
        sin,
        -sin,
        cos,
        pivotX - (pivotX * cos - pivotY * sin),
        pivotY - (pivotX * sin + pivotY * cos)
      );
    } else {
      // Quadratic Bézier from -d/2 to +d/2 with the control point pushed
      // sideways; re-centred so the middle sample lands on the identity.
      const along = distance * u;
      const across = curved ? bend * (2 * (1 - t) * t - 0.5) : 0;
      ctx.setTransform(1, 0, 0, 1, dirX * along + perpX * across, dirY * along + perpY * across);
    }
    ctx.drawImage(image, 0, 0);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};

smear.displayName = "smear";

export default smear;
