import { createSeededRandom } from "./utils.js";
import ripple from "./renderers/ripple.js";
import spiral from "./renderers/spiral.js";
import waves from "./renderers/waves.js";
import crt from "./renderers/crt.js";
import dither from "./renderers/dither.js";
import duotone from "./renderers/duotone.js";
import filmGrain from "./renderers/filmGrain.js";
import oilPaint from "./renderers/oilPaint.js";
import pixelSort from "./renderers/pixelSort.js";
import posterize from "./renderers/posterize.js";
import sketch from "./renderers/sketch.js";
import vhs from "./renderers/vhs.js";

const renderers = { ripple, spiral, waves, crt, dither, duotone, filmGrain, oilPaint, pixelSort, posterize, sketch, vhs };

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
