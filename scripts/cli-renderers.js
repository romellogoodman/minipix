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
import angularBlur from "../src/workers/renderers/angularBlur.js";
import barShift from "../src/workers/renderers/barShift.js";
import bokehBlur from "../src/workers/renderers/bokehBlur.js";
import bulge from "../src/workers/renderers/bulge.js";
import chalkboard from "../src/workers/renderers/chalkboard.js";
import channelBlur from "../src/workers/renderers/channelBlur.js";
import chromaticAberration from "../src/workers/renderers/chromaticAberration.js";
import compression from "../src/workers/renderers/compression.js";
import concentricSpin from "../src/workers/renderers/concentricSpin.js";
import contourLines from "../src/workers/renderers/contourLines.js";
import crt from "../src/workers/renderers/crt.js";
import dataMosh from "../src/workers/renderers/dataMosh.js";
import diffuseBlur from "../src/workers/renderers/diffuseBlur.js";
import dither from "../src/workers/renderers/dither.js";
import duotone from "../src/workers/renderers/duotone.js";
import emboss from "../src/workers/renderers/emboss.js";
import engraving from "../src/workers/renderers/engraving.js";
import filmGrain from "../src/workers/renderers/filmGrain.js";
import flutedGlass from "../src/workers/renderers/flutedGlass.js";
import glassTiles from "../src/workers/renderers/glassTiles.js";
import glow from "../src/workers/renderers/glow.js";
import gradientMap from "../src/workers/renderers/gradientMap.js";
import lensDistortion from "../src/workers/renderers/lensDistortion.js";
import melt from "../src/workers/renderers/melt.js";
import mirror from "../src/workers/renderers/mirror.js";
import motionMask from "../src/workers/renderers/motionMask.js";
import neonEdge from "../src/workers/renderers/neonEdge.js";
import oilPaint from "../src/workers/renderers/oilPaint.js";
import paperPrint from "../src/workers/renderers/paperPrint.js";
import photocopy from "../src/workers/renderers/photocopy.js";
import pixelSort from "../src/workers/renderers/pixelSort.js";
import polar from "../src/workers/renderers/polar.js";
import posterize from "../src/workers/renderers/posterize.js";
import ripple from "../src/workers/renderers/ripple.js";
import risograph from "../src/workers/renderers/risograph.js";
import sketch from "../src/workers/renderers/sketch.js";
import solarize from "../src/workers/renderers/solarize.js";
import spiral from "../src/workers/renderers/spiral.js";
import tiltShift from "../src/workers/renderers/tiltShift.js";
import velocityBlur from "../src/workers/renderers/velocityBlur.js";
import vhs from "../src/workers/renderers/vhs.js";
import watercolor from "../src/workers/renderers/watercolor.js";
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
  angularBlur,
  barShift,
  bokehBlur,
  bulge,
  chalkboard,
  channelBlur,
  chromaticAberration,
  compression,
  concentricSpin,
  contourLines,
  crt,
  dataMosh,
  diffuseBlur,
  dither,
  duotone,
  emboss,
  engraving,
  filmGrain,
  flutedGlass,
  glassTiles,
  glow,
  gradientMap,
  lensDistortion,
  melt,
  mirror,
  motionMask,
  neonEdge,
  oilPaint,
  paperPrint,
  photocopy,
  pixelSort,
  polar,
  posterize,
  ripple,
  risograph,
  sketch,
  solarize,
  spiral,
  tiltShift,
  velocityBlur,
  vhs,
  watercolor,
  waves,
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
