import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const subdivision = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const config = rendererConfig.subdivision;

  const maxDepth = randInt(config.maxDepth, random);
  const skipProbability = randFloat(config.skipProbability, random);

  const regions = [];
  const subdivide = (x, y, width, height, depth) => {
    if (depth >= maxDepth || width < config.minSize || height < config.minSize) {
      regions.push({ x, y, width, height });
      return;
    }
    if (depth > 0 && random() < skipProbability) {
      regions.push({ x, y, width, height });
      return;
    }

    const splitPercent = randFloat(config.splitPercent, random);
    if (random() < 0.5) {
      const h = height * splitPercent;
      subdivide(x, y, width, h, depth + 1);
      subdivide(x, y + h, width, height - h, depth + 1);
    } else {
      const w = width * splitPercent;
      subdivide(x, y, w, height, depth + 1);
      subdivide(x + w, y, width - w, height, depth + 1);
    }
  };

  subdivide(0, 0, canvas.width, canvas.height, 0);

  regions.forEach((r) => {
    const flipH = random() < 0.5;
    const flipV = random() < 0.5;
    ctx.save();
    ctx.translate(r.x + (flipH ? r.width : 0), r.y + (flipV ? r.height : 0));
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    ctx.restore();
  });
};

subdivision.displayName = "subdivision";

export default subdivision;
