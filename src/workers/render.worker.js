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
import risograph from "./renderers/risograph.js";
import neonEdge from "./renderers/neonEdge.js";
import photocopy from "./renderers/photocopy.js";
import melt from "./renderers/melt.js";
import motionMask from "./renderers/motionMask.js";
import velocityBlur from "./renderers/velocityBlur.js";
import bulge from "./renderers/bulge.js";
import concentricSpin from "./renderers/concentricSpin.js";
import polar from "./renderers/polar.js";
import mirror from "./renderers/mirror.js";
import flutedGlass from "./renderers/flutedGlass.js";
import compression from "./renderers/compression.js";
import glow from "./renderers/glow.js";
import solarize from "./renderers/solarize.js";
import gradientMap from "./renderers/gradientMap.js";
import paperPrint from "./renderers/paperPrint.js";
import engraving from "./renderers/engraving.js";
import contourLines from "./renderers/contourLines.js";
import chalkboard from "./renderers/chalkboard.js";
import watercolor from "./renderers/watercolor.js";
import emboss from "./renderers/emboss.js";
import angularBlur from "./renderers/angularBlur.js";
import bokehBlur from "./renderers/bokehBlur.js";
import channelBlur from "./renderers/channelBlur.js";
import tiltShift from "./renderers/tiltShift.js";
import diffuseBlur from "./renderers/diffuseBlur.js";
import glassTiles from "./renderers/glassTiles.js";
import lensDistortion from "./renderers/lensDistortion.js";
import chromaticAberration from "./renderers/chromaticAberration.js";
import barShift from "./renderers/barShift.js";
import dataMosh from "./renderers/dataMosh.js";

const renderers = {
  ripple, spiral, waves, crt, dither, duotone, filmGrain, oilPaint, pixelSort, posterize, sketch,
  vhs, risograph, neonEdge, photocopy, melt, motionMask, velocityBlur, bulge, concentricSpin, polar,
  mirror, flutedGlass, compression, glow, solarize, gradientMap, paperPrint, engraving,
  contourLines, chalkboard, watercolor, emboss, angularBlur, bokehBlur, channelBlur, tiltShift,
  diffuseBlur, glassTiles, lensDistortion, chromaticAberration, barShift, dataMosh,
};

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
