import { rendererConfig } from "./renderers";
import { generateSeedHash, parseSeed } from "./utils/download.js";

// Renderer groups for the renderer picker. Anything missing from these
// lists (e.g. a renderer added later) lands in "Other".
const GROUPS = [
  {
    label: "Glitch",
    names: [
      "barShift",
      "barSwap",
      "chromaticAberration",
      "compression",
      "crt",
      "dataMosh",
      "glitch",
      "gridSwap",
      "melt",
      "pixelSort",
      "scooch",
      "vhs",
    ],
  },
  {
    label: "Print & dither",
    names: [
      "asciiMosaic",
      "crosshatch",
      "dither",
      "halftone",
      "photocopy",
      "posterize",
      "risograph",
      "sketch",
    ],
  },
  {
    label: "Blur & motion",
    names: [
      "angularBlur",
      "arrowField",
      "bokehBlur",
      "channelBlur",
      "diffuseBlur",
      "echo",
      "motionMask",
      "radialBlur",
      "ripple",
      "smear",
      "spiral",
      "tiltShift",
      "velocityBlur",
      "waves",
    ],
  },
  {
    label: "Distort",
    names: [
      "bulge",
      "concentricSpin",
      "flutedGlass",
      "glassTiles",
      "lensDistortion",
      "mirror",
      "polar",
    ],
  },
  {
    label: "Drawn & painted",
    names: ["chalkboard", "contourLines", "emboss", "engraving", "watercolor"],
  },
  {
    label: "Geometric",
    names: [
      "circlePacking",
      "kaleidoscope",
      "lowPoly",
      "pixelated",
      "stacked",
      "stackedCircle",
      "subdivision",
    ],
  },
  {
    label: "Colour & film",
    names: [
      "duotone",
      "filmGrain",
      "glow",
      "gradientMap",
      "lightLeak",
      "neonEdge",
      "oilPaint",
      "paperPrint",
      "solarize",
    ],
  },
];

export function rendererGroups(names) {
  const byName = (a, b) => a.localeCompare(b);
  const grouped = GROUPS.map((g) => ({ ...g, names: g.names.filter((n) => names.includes(n)).sort(byName) }));
  const known = new Set(GROUPS.flatMap((g) => g.names));
  const other = names.filter((n) => !known.has(n)).sort(byName);
  if (other.length > 0) grouped.push({ label: "Other", names: other });
  return grouped.filter((g) => g.names.length > 0);
}

export const DESCRIPTIONS = {
  angularBlur: "Spins the image around a random centre, crisp at the pivot and swirling towards the edges.",
  arrowField: "Arrows following a structure-tensor orientation field, like optical flow on a still.",
  asciiMosaic: "Redraws the image as a grid of text glyphs picked by brightness.",
  barShift: "Slices the image into angled bars that each slide along their length, some with split colour.",
  barSwap: "Cuts the image into vertical or horizontal bars and shuffles them.",
  bokehBlur: "Lens defocus through a bladed or novelty aperture, with bright highlights blooming into shaped discs.",
  bulge: "Magnifies or pinches the image around a random point, or wraps a disc of it onto a glossy sphere.",
  chalkboard: "Chalk outlines and broken cross-hatching on a dusty blackboard.",
  channelBlur: "Blurs red, green and blue by different amounts, splitting edges into soft coloured halos.",
  chromaticAberration: "Splits red, green and blue apart along one direction or radially from a lens centre.",
  circlePacking: "Packs non-overlapping circles filled with the colour beneath them.",
  compression: "Real 8×8 DCT JPEG quantization at a brutal quality, with 4:2:0 colour bleed, ringing and re-saved block grids.",
  concentricSpin: "Cuts the image into concentric rings and turns each one by its own random angle.",
  contourLines: "Topographic iso-lines of blurred brightness over paper, elevation bands, a dark ground or the flattened image.",
  crosshatch: "Short hatched strokes in a reduced palette, denser in the shadows.",
  crt: "Scanlines, bloom, RGB shift, curvature and vignette of an old monitor.",
  dataMosh: "Corrupted-codec macroblocks that drag their pixels in streaks along a motion field.",
  diffuseBlur: "Scatters every pixel a short random distance, dissolving edges into sandy grain (sometimes brushed or patchy).",
  dither: "Dominant-colour palette with Atkinson, ordered (Bayer) or blue-noise dithering.",
  duotone: "Maps luminance onto a two-colour ramp picked from the hue wheel.",
  echo: "Stacks fading ghosts stepped along a path, optionally rotating or zooming.",
  emboss: "Relief-lit height map from brightness with cast shadows, over the colour image, a metal plate or carved stone.",
  engraving: "Copper-plate line engraving: lines swell with darkness and follow the form, as a single plate, cross-hatch or spiral.",
  filmGrain: "Grain, a vintage tint, contrast, vignette and a few scratches.",
  flutedGlass: "Looks through reeded glass: vertical or angled flutes that refract, fringe and catch the light.",
  glassTiles: "Pressed-glass blocks that each refract, shrink or magnify their patch of the image.",
  glitch: "Offsets horizontal slices, with optional channel shift and inversion.",
  glow: "Screens a soft multi-scale bloom from the highlights, sometimes with 4- or 6-point star glints.",
  gradientMap: "Maps luminance through a 3–5 stop colour gradient (shadows, mids, highlights) blended in OKLab.",
  gridSwap: "Cuts the image into a grid and shuffles the cells.",
  halftone: "Halftone screening: dots, lines, Bayer or Floyd–Steinberg modes.",
  kaleidoscope: "Mirrors a square sample into a tiled kaleidoscope pattern.",
  lensDistortion: "Barrel or pincushion lens warp that splits the image into shifted rainbow layers.",
  lightLeak: "Screens warm radial light leaks in from the frame edges.",
  lowPoly: "Triangulates a jittered grid and fills each triangle with its average colour.",
  melt: "Warps pixels with layered noise so the image appears to drip and melt.",
  mirror: "Reflects the image across a line through a random point (sometimes two), for book-matched symmetry.",
  motionMask: "Frame-differences the image against shifted copies to reveal edges in motion.",
  neonEdge: "Darkens the image and traces its edges with glowing neon hues.",
  oilPaint: "Kuwahara-style smoothing with quantized, saturated colour.",
  paperPrint: "An aged analog print: faded split-toned grade, vignette, ink on cream paper with fibres and foxing.",
  photocopy: "High-contrast threshold, toner noise and banding from repeat copying.",
  pixelated: "Averages the image into large square blocks.",
  pixelSort: "Sorts runs of pixels by brightness past a threshold.",
  polar: "Wraps the image into a mirrored tiny-planet rosette, or unrolls the rings around a point into a strip.",
  posterize: "Quantizes each channel to a few flat levels.",
  radialBlur: "Zoom blur radiating from an off-centre point.",
  risograph: "Layers of misregistered Riso inks multiplied with grain.",
  ripple: "Concentric water ripples displacing the image.",
  scooch: "Wrap-shifts the image horizontally and vertically like a torus.",
  sketch: "Pencil-style edges plus cross-hatching in the darks.",
  smear: "Averages the image along a straight, curved or rotational trajectory.",
  solarize: "Darkroom solarization: tones above a threshold fold back toward black, sometimes per channel or hue-rotated.",
  spiral: "Twists pixels around the centre, optionally oscillating.",
  stacked: "Nested, shrinking copies of the image centred on each other.",
  stackedCircle: "Nested circular crops, uniform or rotated.",
  subdivision: "Recursively splits the canvas into rectangles and randomly flips each one.",
  tiltShift: "Miniature-model focus: a sharp band at a random angle with blur rising away from it and a saturation boost.",
  velocityBlur: "Motion-blurs bands or tracked blobs along synthetic velocities.",
  vhs: "Tracking noise, colour bleed and wobble of a worn tape.",
  watercolor: "Soft Kuwahara washes with darkened edges, granulating pigment and paper grain.",
  waves: "Sine-wave displacement across the image.",
};

// Ranges the renderers sample with randInt / randomNumber (integers). Every
// other { min, max } range is sampled as a float.
const INT_PARAMS = new Set([
  "arrowField.cols",
  "asciiMosaic.cols",
  "barShift.count",
  "barSwap.numBars",
  "bokehBlur.bladeCount",
  "circlePacking.attempts",
  "concentricSpin.rings",
  "contourLines.levels",
  "crosshatch.numColors",
  "crt.scanlineCount",
  "dither.bayerSize",
  "dither.blueNoiseScale",
  "dither.numColors",
  "echo.numCopies",
  "filmGrain.scratchCount",
  "flutedGlass.flutes",
  "glassTiles.tileCount",
  "glitch.numSlices",
  "gradientMap.stops",
  "gridSwap.baseGridSize",
  "gridSwap.extraGridCells",
  "halftone.numColors",
  "kaleidoscope.squareCount",
  "lensDistortion.count",
  "lightLeak.numLeaks",
  "lowPoly.cells",
  "melt.numOctaves",
  "motionMask.numEchoes",
  "neonEdge.glowRadius",
  "neonEdge.numHues",
  "oilPaint.levels",
  "photocopy.bandHeight",
  "photocopy.generations",
  "photocopy.smear",
  "polar.petals",
  "posterize.levels",
  "radialBlur.numSamples",
  "ripple.numRipples",
  "risograph.numLayers",
  "scooch.numScooches",
  "sketch.edgeThreshold",
  "sketch.hatchingDensity",
  "sketch.lineThickness",
  "smear.numSamples",
  "solarize.folds",
  "stacked.numStacks",
  "stackedCircle.numStacks",
  "stackedCircle.rotation",
  "subdivision.maxDepth",
  "velocityBlur.numBands",
  "velocityBlur.numBlobs",
  "velocityBlur.numSamples",
]);

// Ranges read as a span (outer → inner size) rather than sampled once, so they
// get independent min / max controls instead of a single pinned value. (stacked
// still draws its inner size at random, up to twice `min`.)
const SPAN_PARAMS = new Set(["stacked.sizeFactor", "stackedCircle.sizeFactor"]);

// Power-of-ten step giving roughly 100 slider positions across `span`.
const floatStep = (span) => 10 ** Math.floor(Math.log10(span / 100));

// "hatchLightsProbability" → "Hatch lights": the key in words, minus the suffix
// that only says how the value is stored.
const labelFor = (key) => {
  const words = key.replace(/(Probability|Percent)$/, "").replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * One control spec per config key of a renderer:
 * - range: { min, max } sampled range; pinning sets min = max = value
 * - span: { min, max } used as-is; both ends editable
 * - probability: plain 0–1 chance
 * - number: other plain constant
 */
export function paramSpecs(name) {
  return Object.entries(rendererConfig[name]).map(([key, value]) => ({
    label: labelFor(key),
    // *Percent values are fractions of the image size; shown as percentages.
    percent: key.endsWith("Percent"),
    ...baseSpec(name, key, value),
  }));
}

function baseSpec(name, key, value) {
  const id = `${name}.${key}`;
  if (value && typeof value === "object") {
    if (SPAN_PARAMS.has(id)) {
      return { key, kind: "span", min: 0.05, max: 1.5, step: 0.01, int: false, auto: value };
    }
    const int = INT_PARAMS.has(id);
    const step = int ? 1 : floatStep(value.max - value.min);
    return { key, kind: "range", min: value.min, max: value.max, step, int, auto: value };
  }
  if (key.endsWith("Probability")) {
    return { key, kind: "probability", min: 0, max: 1, step: 0.01, int: false, auto: value };
  }
  const int = Number.isInteger(value);
  const max = int ? Math.max(value * 2, value + 4) : value * 2 || 1;
  const step = int ? 1 : floatStep(max);
  return { key, kind: "number", min: 0, max, step, int, auto: value };
}

// Renderer config with pins applied. Only ranges change, so the
// renderer's RNG call order (and therefore the rest of the image) is intact.
// Nearest slider position to `raw`, without float noise (0.30000000000000004).
function snapToStep(spec, raw) {
  const decimals = Math.max(0, -Math.floor(Math.log10(spec.step)));
  return Number((Math.round(raw / spec.step) * spec.step).toFixed(decimals));
}

// A random pinned value for one parameter: anywhere on its slider, snapped to
// the slider's step. (UI-only, so Math.random rather than the render seed.)
export function randomParamValue(spec) {
  const pick = () => snapToStep(spec, spec.min + Math.random() * (spec.max - spec.min));
  if (spec.kind === "span") {
    const [a, b] = [pick(), pick()];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return pick();
}

export function buildConfig(name, overrides) {
  const config = { ...rendererConfig[name] };
  for (const spec of paramSpecs(name)) {
    if (!(spec.key in overrides)) continue;
    const v = overrides[spec.key];
    config[spec.key] = spec.kind === "range" ? { min: v, max: v } : v;
  }
  return config;
}

export function formatValue(value, spec) {
  if (spec.int) return String(Math.round(value));
  const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(spec.step))));
  if (spec.percent) return `${(value * 100).toFixed(Math.max(0, decimals - 2))}%`;
  return Number(value).toFixed(decimals);
}

/**
 * The code for one variation: the seed hash, then one "-" entry per pinned
 * parameter as base36 `index.step` (spans: `index.minStep.maxStep`), where
 * index is the parameter's position in paramSpecs and step its slider position.
 * "1hfj1o6" has nothing pinned; "1hfj1o6-3.k-7.1a" pins two parameters.
 */
export function variationCode(seed, name, overrides) {
  const steps = (spec, v) => Math.max(0, Math.round((v - spec.min) / spec.step)).toString(36);
  const entries = paramSpecs(name).flatMap((spec, i) => {
    if (!(spec.key in overrides)) return [];
    const v = overrides[spec.key];
    const parts = spec.kind === "span" ? [steps(spec, v.min), steps(spec, v.max)] : [steps(spec, v)];
    return [[i.toString(36), ...parts].join(".")];
  });
  return [generateSeedHash(seed), ...entries].join("-");
}

// Inverse of variationCode for `name`: { seed, overrides }, or null if the seed
// part doesn't parse. Entries that don't fit this renderer are ignored.
export function parseVariationCode(text, name) {
  const [head, ...entries] = String(text ?? "").trim().toLowerCase().split("-");
  const seed = parseSeed(head);
  if (seed === null) return null;
  const specs = paramSpecs(name);
  const overrides = {};
  for (const entry of entries) {
    const [i, ...parts] = entry.split(".").map((n) => parseInt(n, 36));
    const spec = specs[i];
    if (!spec || parts.some(Number.isNaN)) continue;
    const value = (s) => snapToStep(spec, Math.min(spec.max, spec.min + s * spec.step));
    if (spec.kind === "span" && parts.length === 2) {
      overrides[spec.key] = { min: value(parts[0]), max: value(parts[1]) };
    } else if (spec.kind !== "span" && parts.length === 1) {
      overrides[spec.key] = value(parts[0]);
    }
  }
  return { seed, overrides };
}
