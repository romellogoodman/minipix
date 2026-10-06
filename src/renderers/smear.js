import { setupRenderer, randInt, randFloat, createCanvasLike } from "../utils/index.js";
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

  const baseWeight = Math.max(1e-3, (smearWeight * sharpness) / (1 - sharpness));
  if (rotate) {
    rotationalSmear(canvas, ctx, image, numSamples, rotation, pivotX, pivotY, baseWeight / (baseWeight + smearWeight));
    return;
  }

  // Opaque base at identity so uncovered strips never go transparent; it
  // counts as the first sample of the running average.
  ctx.drawImage(image, 0, 0);
  let weightSum = baseWeight;

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
      // Whole-pixel offsets: an integer translate is a straight blit (no
      // resampling), several times cheaper, and samples are >= 4px apart
      // anyway so the half-pixel snap is invisible.
      ctx.setTransform(
        1,
        0,
        0,
        1,
        Math.round(dirX * along + perpX * across),
        Math.round(dirY * along + perpY * across)
      );
    }
    ctx.drawImage(image, 0, 0);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};

/**
 * Rotational smear without one rotated full-canvas draw per sample. The
 * numSamples rotations (step = rotation / numSamples, centred on 0) are
 * built as two box filters in a row — box(a) then box(b) with
 * a + b - 1 = numSamples — so the samples land on exactly the original
 * angles with triangular rather than raised-cosine weights. Each box takes
 * ~log2(n) rotated draws: doubling (B + rot(k)·B) / 2, or adding one more
 * copy of the box input. Rotations about one pivot compose by adding
 * angles, which is what makes the doubling exact.
 */
const rotationalSmear = (canvas, ctx, image, numSamples, rotation, pivotX, pivotY, sharpShare) => {
  const { width, height } = canvas;
  const step = rotation / numSamples;
  const setRot = (c, theta) => {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    c.setTransform(cos, sin, -sin, cos, pivotX - (pivotX * cos - pivotY * sin), pivotY - (pivotX * sin + pivotY * cos));
  };
  const scratchA = createCanvasLike(canvas, width, height);
  const scratchB = createCanvasLike(canvas, width, height);
  const ctxOf = new Map([
    [canvas, ctx],
    [scratchA, scratchA.getContext("2d")],
    [scratchB, scratchB.getContext("2d")],
  ]);

  // box(n): average of rot(j·step)·src for j < n, where src is drawn by
  // `drawSrc(ctx, theta)`. Ping-pongs between `cur` and `spare`; returns the
  // canvas holding the result.
  const box = (n, drawSrc, cur, spare) => {
    const bits = n.toString(2);
    let k = 1;
    for (let b = 1; b < bits.length; b++) {
      // Double: cur <- (cur + rot(k)·cur) / 2, via spare.
      const sctx = ctxOf.get(spare);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalAlpha = 1;
      sctx.drawImage(cur, 0, 0);
      sctx.globalAlpha = 0.5;
      setRot(sctx, k * step);
      sctx.drawImage(cur, 0, 0);
      [cur, spare] = [spare, cur];
      k *= 2;
      if (bits[b] === "1") {
        const c = ctxOf.get(cur);
        c.globalAlpha = 1 / (k + 1);
        drawSrc(c, k * step);
        k += 1;
      }
    }
    const c = ctxOf.get(cur);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    return cur;
  };

  const a = Math.ceil((numSamples + 1) / 2);
  const b = numSamples + 1 - a;
  const start = -step * (numSamples - 1) / 2;

  // Stage 1 input: the image rotated to the first sample angle, over an
  // unrotated copy so the corners it leaves uncovered stay opaque.
  const s1 = ctxOf.get(scratchA);
  s1.drawImage(image, 0, 0);
  setRot(s1, start);
  s1.drawImage(image, 0, 0);
  s1.setTransform(1, 0, 0, 1, 0, 0);
  const drawImageAt = (c, theta) => {
    setRot(c, start + theta);
    c.drawImage(image, 0, 0);
  };
  const stage1 = box(a, drawImageAt, scratchA, scratchB);

  // Stage 2 input is stage 1's result, which must stay intact for the
  // "add one copy" steps, so ping-pong through the other two canvases.
  const others = [canvas, scratchA, scratchB].filter((c) => c !== stage1);
  const first = ctxOf.get(others[0]);
  first.drawImage(stage1, 0, 0);
  const drawStage1At = (c, theta) => {
    setRot(c, theta);
    c.drawImage(stage1, 0, 0);
  };
  const result = box(b, drawStage1At, others[0], others[1]);

  if (result !== canvas) ctx.drawImage(result, 0, 0);
  // Sharp base copy keeps its share of the average.
  ctx.globalAlpha = sharpShare;
  ctx.drawImage(image, 0, 0);
  ctx.globalAlpha = 1;
};

smear.displayName = "smear";

export default smear;
