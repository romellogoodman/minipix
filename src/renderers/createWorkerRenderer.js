import { workerPool } from "../workers/pool.js";
import { rendererConfig } from "./config.js";

// Source pixels per image, so repeat renders copy a buffer instead of paying
// drawImage + getImageData (a slow GPU readback) on the main thread for every
// canvas. Small LRU keeps memory bounded when many images are uploaded.
const MAX_CACHED_IMAGES = 3;
const sourcePixelCache = new Map();

const getSourcePixels = (image) => {
  let pixels = sourcePixelCache.get(image);
  if (pixels) {
    sourcePixelCache.delete(image); // refresh LRU position
  } else {
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    if (sourcePixelCache.size >= MAX_CACHED_IMAGES) {
      sourcePixelCache.delete(sourcePixelCache.keys().next().value);
    }
  }
  sourcePixelCache.set(image, pixels);
  return pixels;
};

// Factory for worker-based async renderers
const createWorkerRenderer = (name) => {
  const renderer = ({ canvas, image, seed = Date.now() }) => {
    if (!image) return;

    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;

    // Copy because the buffer is transferred to (and detached by) the worker.
    const sourcePixels = new Uint8ClampedArray(getSourcePixels(image));

    const promise = workerPool.render(
      name,
      sourcePixels,
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
