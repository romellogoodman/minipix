import { workerPool } from "../workers/pool.js";
import { rendererConfig } from "./config.js";

// Factory for worker-based async renderers
const createWorkerRenderer = (name) => {
  const renderer = ({ canvas, image, seed = Date.now() }) => {
    if (!image) return;

    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;

    ctx.drawImage(image, 0, 0);
    const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const promise = workerPool.render(
      name,
      sourceData.data,
      canvas.width,
      canvas.height,
      seed,
      rendererConfig[name]
    );

    const wrapped = promise.then((result) => {
      ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    });
    wrapped.cancel = promise.cancel;
    return wrapped;
  };
  renderer.isAsync = true;
  renderer.displayName = name;
  return renderer;
};

export default createWorkerRenderer;
