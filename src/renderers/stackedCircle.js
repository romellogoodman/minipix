import { setupRenderer, randInt, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const stackedCircle = ({ canvas, image, seed = Date.now(), config = rendererConfig.stackedCircle }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);

  const isUniform = random() < 0.5;
  const numStacks = randInt(config.numStacks, random);
  // Uniform mode with no rotation is pixel-identical to the input; skip mode 0 there.
  const rotationMode = isUniform ? 1 + Math.floor(random() * 2) : Math.floor(random() * 3);
  const targetRotation = rotationMode === 2 ? randInt(config.rotation, random) : 0;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const rotationFor = (i) => {
    if (rotationMode === 1 && i !== 0) return randInt(config.rotation, random);
    if (rotationMode === 2) return map(i, 0, numStacks - 1, 0, targetRotation);
    return 0;
  };

  const drawRotated = (rotation, draw) => {
    ctx.save();
    if (rotation !== 0) {
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    draw();
    ctx.restore();
  };

  if (isUniform) {
    const maxRadius = Math.min(image.width, image.height) / 2;
    for (let i = 0; i < numStacks; i++) {
      const rotation = rotationFor(i);
      drawRotated(rotation, () => {
        if (i > 0) {
          const outerRadius = maxRadius * map(i, 1, numStacks - 1, 1, 0.2);
          ctx.beginPath();
          ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
          if (i < numStacks - 1) {
            const innerRadius = maxRadius * map(i + 1, 1, numStacks - 1, 1, 0.2);
            ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
          }
          ctx.clip();
        }
        ctx.drawImage(image, 0, 0);
      });
    }
  } else {
    for (let i = 0; i < numStacks; i++) {
      const sizeFactor = map(i, 0, numStacks - 1, config.sizeFactor.max, config.sizeFactor.min);
      const w = image.width * sizeFactor;
      const h = image.height * sizeFactor;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      const rotation = rotationFor(i);
      drawRotated(rotation, () => {
        if (i > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.drawImage(image, x, y, w, h);
      });
    }
  }
};

stackedCircle.displayName = "stackedCircle";

export default stackedCircle;
