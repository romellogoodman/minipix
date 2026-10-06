import { randFloat, randInt, COLOR_RAMPS } from "../utils.js";

// sRGB (0–255) ↔ OKLab, for perceptually even gradients between stops.
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

const rgbToOklab = ([r, g, b]) => {
  r = toLinear(r); g = toLinear(g); b = toLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const oklabToRgb = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

// Hue offsets (degrees) for the harmony palettes.
const SCHEMES = [
  [0, 30, 60, 90, 120], // analogous sweep
  [0, 180, 20, 200, 40], // complementary
  [0, 120, 240, 60, 180], // triad
  [0, 150, 210, 30, 180], // split complementary
];

export default function gradientMap({ imageData, width, height, config, random, outputData }) {
  const stopCount = randInt(config.stops, random);
  const contrast = randFloat(config.contrast, random);
  const midpoint = randFloat(config.midpoint, random);
  const strength = randFloat(config.strength, random);
  const reverse = random() < config.reverseProbability;
  // Palette source: the shader's cosine palettes, a seeded hue harmony with
  // rising lightness (tritone-style shadows → mids → highlights), or a preset ramp.
  const pick = random();
  const cosine = Array.from({ length: 12 }, () => random());
  const baseHue = random() * 360;
  const scheme = SCHEMES[Math.floor(random() * SCHEMES.length)];
  const chroma = randFloat(config.chroma, random);
  const hueJitter = Array.from({ length: 5 }, () => (random() - 0.5) * 30);
  const rampNames = Object.keys(COLOR_RAMPS);
  const ramp = COLOR_RAMPS[rampNames[Math.floor(random() * rampNames.length)]];

  let stops;
  if (pick < config.cosineProbability) {
    // iq's a + b·cos(2π(c·t + d)): bias/amp keep it bright and varied; the
    // stops are sampled from it then re-sorted dark → light.
    const [a0, a1, a2, b0, b1, b2, c0, c1, c2, d0, d1, d2] = cosine;
    const a = [0.4 + a0 * 0.2, 0.4 + a1 * 0.2, 0.4 + a2 * 0.2];
    const b = [0.3 + b0 * 0.25, 0.3 + b1 * 0.25, 0.3 + b2 * 0.25];
    const c = [0.6 + c0 * 0.6, 0.6 + c1 * 0.6, 0.6 + c2 * 0.6];
    const d = [d0, d1, d2];
    stops = [];
    for (let k = 0; k < stopCount; k++) {
      const t = k / (stopCount - 1);
      stops.push(rgbToOklab([0, 1, 2].map((j) => 255 * (a[j] + b[j] * Math.cos(2 * Math.PI * (c[j] * t + d[j]))))));
    }
    stops.sort((p, q) => p[0] - q[0]);
    // Spread lightness so the image stays legible.
    stops.forEach((s, k) => { s[0] = 0.12 + (0.85 * k) / (stopCount - 1) * 0.6 + s[0] * 0.4; });
  } else if (pick < config.cosineProbability + config.harmonyProbability) {
    stops = [];
    for (let k = 0; k < stopCount; k++) {
      const t = k / (stopCount - 1);
      const h = ((baseHue + scheme[k] + hueJitter[k]) * Math.PI) / 180;
      // Chroma peaks in the mids; the ends stay near-black / near-white.
      const C = chroma * (0.35 + 0.65 * Math.sin(Math.PI * (0.15 + 0.7 * t)));
      stops.push([0.14 + 0.82 * t, C * Math.cos(h), C * Math.sin(h)]);
    }
  } else {
    stops = ramp.map(rgbToOklab);
  }
  if (reverse) stops.reverse();

  // Bake a 1024-entry LUT, interpolating in OKLab.
  const N = 1024;
  const lut = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) {
    const pos = (i / (N - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(pos)), f = pos - k;
    const p = stops[k], q = stops[k + 1];
    const rgb = oklabToRgb([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]);
    lut[i * 3] = rgb[0]; lut[i * 3 + 1] = rgb[1]; lut[i * 3 + 2] = rgb[2];
  }

  // Auto black/white points at the 1st/99th luminance percentiles.
  const hist = new Uint32Array(256);
  const n = width * height;
  for (let i = 0; i < imageData.length; i += 4) {
    hist[(0.2126 * imageData[i] + 0.7152 * imageData[i + 1] + 0.0722 * imageData[i + 2]) | 0]++;
  }
  let lo = 0, hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  if (hi <= lo) { lo = 0; hi = 255; }

  // Luminance (0–255, fractional) → LUT index, through levels, contrast and
  // a gamma that puts mid-grey at `midpoint`.
  const gamma = Math.log(midpoint) / Math.log(0.5);
  const index = new Uint16Array(256 * 4);
  for (let v = 0; v < index.length; v++) {
    let t = (v / 4 - lo) / (hi - lo);
    t = Math.min(1, Math.max(0, (t - 0.5) * contrast + 0.5));
    index[v] = Math.round(t ** gamma * (N - 1)) * 3;
  }

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
    const j = index[((0.2126 * r + 0.7152 * g + 0.0722 * b) * 4) | 0];
    outputData[i] = r + (lut[j] - r) * strength;
    outputData[i + 1] = g + (lut[j + 1] - g) * strength;
    outputData[i + 2] = b + (lut[j + 2] - b) * strength;
    outputData[i + 3] = 255;
  }
}
