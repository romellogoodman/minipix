// Renderer registry for the Node CLI.
//
// The web app loads renderers through src/renderers/index.js, which pulls in
// the browser-only WorkerPool (it touches `navigator`/`Worker` at import time).
// The CLI cannot import that module, so it wires up its own registry here:
//   - Sync renderers are imported from their individual files and called with
//     ({ canvas, image, seed }).
//   - Worker renderers are pure functions that normally run inside a Web
//     Worker. The CLI imports them directly and runs them on the main thread,
//     feeding them the source ImageData and reading back the result.

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
import crt from "../src/workers/renderers/crt.js";
import dither from "../src/workers/renderers/dither.js";
import duotone from "../src/workers/renderers/duotone.js";
import filmGrain from "../src/workers/renderers/filmGrain.js";
import melt from "../src/workers/renderers/melt.js";
import motionMask from "../src/workers/renderers/motionMask.js";
import neonEdge from "../src/workers/renderers/neonEdge.js";
import oilPaint from "../src/workers/renderers/oilPaint.js";
import photocopy from "../src/workers/renderers/photocopy.js";
import pixelSort from "../src/workers/renderers/pixelSort.js";
import posterize from "../src/workers/renderers/posterize.js";
import ripple from "../src/workers/renderers/ripple.js";
import risograph from "../src/workers/renderers/risograph.js";
import sketch from "../src/workers/renderers/sketch.js";
import spiral from "../src/workers/renderers/spiral.js";
import velocityBlur from "../src/workers/renderers/velocityBlur.js";
import vhs from "../src/workers/renderers/vhs.js";
import waves from "../src/workers/renderers/waves.js";

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

const workerRenderers = {
  crt,
  dither,
  duotone,
  filmGrain,
  melt,
  motionMask,
  neonEdge,
  oilPaint,
  photocopy,
  pixelSort,
  posterize,
  ripple,
  risograph,
  sketch,
  spiral,
  velocityBlur,
  vhs,
  waves,
};

/** Sorted list of every renderer name the CLI can run. */
export function getRendererNames() {
  return [...Object.keys(syncRenderers), ...Object.keys(workerRenderers)].sort();
}

/** Whether a renderer name is known to the CLI. */
export function hasRenderer(name) {
  return name in syncRenderers || name in workerRenderers;
}

/**
 * Render an image onto the given canvas with the named renderer.
 * Sync renderers draw directly; worker renderers run their pure pixel
 * function and the result is written back to the canvas.
 * Always returns a promise so callers can uniformly `await` it.
 */
export async function renderToCanvas(name, { canvas, image, seed, ImageData }) {
  const syncFn = syncRenderers[name];
  if (syncFn) {
    await syncFn({ canvas, image, seed });
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

  await workerFn({
    imageData: source.data,
    width: canvas.width,
    height: canvas.height,
    config: rendererConfig[name],
    random,
    outputData,
  });

  ctx.putImageData(new ImageData(outputData, canvas.width, canvas.height), 0, 0);
}
