import { workerPool } from "../workers/pool.js";
import { rendererConfig } from "./config.js";

// Factory for worker-based async renderers
const createWorkerRenderer = (name) => {
  const renderer = async ({ canvas, image, seed = Date.now() }) => {
    if (!image) return;

    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(image, 0, 0);
    const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const result = await workerPool.render(
      name,
      sourceData.data,
      canvas.width,
      canvas.height,
      seed,
      rendererConfig[name]
    );

    const outputData = ctx.createImageData(canvas.width, canvas.height);
    outputData.data.set(result.data);
    ctx.putImageData(outputData, 0, 0);
  };
  renderer.isAsync = true;
  renderer.displayName = rendererConfig[name].displayName;
  return renderer;
};

export default createWorkerRenderer;
