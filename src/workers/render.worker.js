import { createSeededRandom } from "./utils.js";
import renderers from "./renderers/index.js";

self.onmessage = function (e) {
  const { type, rendererName, imageData, width, height, config, seed, id } = e.data;
  if (type !== "render") return;

  const renderer = renderers[rendererName];
  if (!renderer) {
    self.postMessage({ id, error: `Unknown renderer: ${rendererName}` });
    return;
  }

  try {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);
    renderer({ imageData, width, height, config, random, outputData });
    self.postMessage({ id, result: outputData.buffer, width, height }, [outputData.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
