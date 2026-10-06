// Every worker (pixel-loop) renderer by name: shared by the Web Worker entry
// and the Node CLI, which runs them on its main thread.
import angularBlur from "./angularBlur.js";
import barShift from "./barShift.js";
import bokehBlur from "./bokehBlur.js";
import bulge from "./bulge.js";
import chalkboard from "./chalkboard.js";
import channelBlur from "./channelBlur.js";
import chromaticAberration from "./chromaticAberration.js";
import compression from "./compression.js";
import concentricSpin from "./concentricSpin.js";
import contourLines from "./contourLines.js";
import crt from "./crt.js";
import dataMosh from "./dataMosh.js";
import diffuseBlur from "./diffuseBlur.js";
import dither from "./dither.js";
import duotone from "./duotone.js";
import emboss from "./emboss.js";
import engraving from "./engraving.js";
import filmGrain from "./filmGrain.js";
import flutedGlass from "./flutedGlass.js";
import glassTiles from "./glassTiles.js";
import glow from "./glow.js";
import gradientMap from "./gradientMap.js";
import lensDistortion from "./lensDistortion.js";
import melt from "./melt.js";
import mirror from "./mirror.js";
import motionMask from "./motionMask.js";
import neonEdge from "./neonEdge.js";
import oilPaint from "./oilPaint.js";
import paperPrint from "./paperPrint.js";
import photocopy from "./photocopy.js";
import pixelSort from "./pixelSort.js";
import polar from "./polar.js";
import posterize from "./posterize.js";
import ripple from "./ripple.js";
import risograph from "./risograph.js";
import sketch from "./sketch.js";
import solarize from "./solarize.js";
import spiral from "./spiral.js";
import tiltShift from "./tiltShift.js";
import velocityBlur from "./velocityBlur.js";
import vhs from "./vhs.js";
import watercolor from "./watercolor.js";
import waves from "./waves.js";

export default {
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
