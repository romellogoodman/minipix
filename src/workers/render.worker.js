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

// Handle messages from main thread
self.onmessage = function (e) {
  const { type, rendererName, imageData, width, height, config, seed, id } = e.data;
  if (type === "render" && renderers[rendererName]) {
    const result = renderers[rendererName](imageData, width, height, config, seed);
    self.postMessage({ id, result: result.buffer, width, height }, [result.buffer]);
  }
};
