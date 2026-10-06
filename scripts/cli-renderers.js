// Renderer registry for the Node CLI. src/renderers/index.js can't be used
// here: it pulls in the browser-only WorkerPool. Sync renderers are imported
// from their own files; worker renderers are pure pixel functions, so the CLI
// runs them on the main thread and writes the result back to the canvas.

import { rendererConfig } from "../src/renderers/config.js";
import { createSeededRandom } from "../src/utils/math.js";

// Sync (main-thread) renderers
import arrowField from "../src/renderers/arrowField.js";
import asciiMosaic from "../src/renderers/asciiMosaic.js";
import barSwap from "../src/renderers/barSwap.js";
import circlePacking from "../src/renderers/circlePacking.js";
import crosshatch from "../src/renderers/crosshatch.js";
import echo from "../src/renderers/echo.js";
import glitch from "../src/renderers/glitch.js";
import gridSwap from "../src/renderers/gridSwap.js";
import halftone, {
  halftoneBayer,
  halftoneClassicDots,
  halftoneFloydSteinberg,
  halftoneLines,
} from "../src/renderers/halftone.js";
import kaleidoscope from "../src/renderers/kaleidoscope.js";
import lightLeak from "../src/renderers/lightLeak.js";
import lowPoly from "../src/renderers/lowPoly.js";
import pixelated from "../src/renderers/pixelated.js";
import radialBlur from "../src/renderers/radialBlur.js";
import scooch from "../src/renderers/scooch.js";
import smear from "../src/renderers/smear.js";
import stacked from "../src/renderers/stacked.js";
import stackedCircle from "../src/renderers/stackedCircle.js";
import subdivision from "../src/renderers/subdivision.js";

// Worker (pure) renderers
import workerRenderers from "../src/workers/renderers/index.js";

const syncRenderers = {
  arrowField,
  asciiMosaic,
  barSwap,
  circlePacking,
  crosshatch,
  echo,
  glitch,
  gridSwap,
  halftone,
  halftoneBayer,
  halftoneClassicDots,
  halftoneFloydSteinberg,
  halftoneLines,
  kaleidoscope,
  lightLeak,
  lowPoly,
  pixelated,
  radialBlur,
  scooch,
  smear,
  stacked,
  stackedCircle,
  subdivision,
};


// Every renderer name the CLI can run, sorted.
export function getRendererNames() {
  return [...Object.keys(syncRenderers), ...Object.keys(workerRenderers)].sort();
}

export function hasRenderer(name) {
  return name in syncRenderers || name in workerRenderers;
}

// ImageData is the global the CLI entry polyfills from node-canvas.
export async function renderToCanvas(name, { canvas, image, seed }) {
  const syncFn = syncRenderers[name];
  if (syncFn) {
    syncFn({ canvas, image, seed });
    return;
  }

  const workerFn = workerRenderers[name];
  if (!workerFn) {
    throw new Error(`Unknown renderer: ${name}`);
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const outputData = new Uint8ClampedArray(source.data.length);
  const random = createSeededRandom(seed);

  workerFn({
    imageData: source.data,
    width: canvas.width,
    height: canvas.height,
    config: rendererConfig[name],
    random,
    outputData,
  });

  ctx.putImageData(new ImageData(outputData, canvas.width, canvas.height), 0, 0);
}
