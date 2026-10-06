import { randInt, randFloat, buildRampLUT, boxBlur } from "../utils.js";

// Hypsometric ramps for the "bands" and "dark" backgrounds.
const RAMPS = [
  [[32, 72, 110], [70, 140, 150], [140, 180, 110], [220, 205, 140], [180, 120, 80], [250, 248, 240]], // terrain
  [[10, 0, 30], [80, 0, 120], [220, 50, 50], [255, 170, 0], [255, 255, 180]], // thermal
  [[0, 30, 70], [0, 110, 170], [90, 200, 220], [210, 245, 250]], // ice
  [[40, 20, 60], [150, 40, 110], [240, 110, 120], [255, 210, 150]], // dusk
  [[20, 50, 30], [70, 120, 60], [170, 190, 110], [240, 230, 190]], // moss
];
const PAPER = [244, 238, 224];
const INK = [58, 40, 30];
const BOARD = [14, 16, 22];

/**
 * Topographic iso-lines (after the ContourLines shader) over the blurred
 * luminance, treated as a height map. Lines are anti-aliased by the local
 * rate of change (a CPU fwidth) so they hold a constant pixel width, with an
 * optional heavier index contour every fifth level. Backgrounds: bare paper,
 * the image flattened to its mean colour per band, hypsometric tint bands, or
 * a dark ground with lines coloured by elevation.
 */
export default function contourLines({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const blur = Math.max(1, Math.round(minDim * randFloat(config.blurPercent, random)));
  const levels = randInt(config.levels, random);
  const gamma = randFloat(config.gamma, random);
  const lineWidth = Math.max(0.6, minDim * randFloat(config.lineWidthPercent, random));
  const softness = randFloat(config.softness, random);
  const invert = random() < config.invertProbability;
  const indexLines = random() < config.indexLineProbability;
  const modeRoll = random();
  const ramp = buildRampLUT(RAMPS[Math.floor(random() * RAMPS.length)]);

  const { paperProbability: pP, bandsProbability: pB, darkProbability: pD } = config;
  const mode = modeRoll < pP ? "paper" : modeRoll < pP + pB ? "bands" : modeRoll < pP + pB + pD ? "dark" : "tint";

  // Height: luminance, three box passes (≈ gaussian), then invert/gamma/scale.
  const n = width * height;
  const S = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    S[j] = (0.2126 * imageData[i] + 0.7152 * imageData[i + 1] + 0.0722 * imageData[i + 2]) / 255;
  }
  const tmp = new Float32Array(n);
  for (let p = 0; p < 3; p++) boxBlur(S, width, height, Math.max(1, Math.round(blur / 1.7)), tmp);
  for (let j = 0; j < n; j++) {
    const v = invert ? 1 - S[j] : S[j];
    // +0.5 so pure black/white don't sit on a band boundary.
    S[j] = Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, gamma) * levels + 0.5;
  }

  // Mean source colour per band, for the flattened backgrounds.
  const bands = levels + 1;
  const bandSum = new Float64Array(bands * 4);
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const b = Math.min(bands - 1, Math.floor(S[j])) * 4;
    bandSum[b] += imageData[i]; bandSum[b + 1] += imageData[i + 1]; bandSum[b + 2] += imageData[i + 2]; bandSum[b + 3]++;
  }
  const bandRGB = new Float32Array(bands * 3);
  for (let b = 0; b < bands; b++) {
    const c = Math.max(1, bandSum[b * 4 + 3]);
    const lum = (0.299 * bandSum[b * 4] + 0.587 * bandSum[b * 4 + 1] + 0.114 * bandSum[b * 4 + 2]) / c;
    for (let k = 0; k < 3; k++) {
      // Band means are muddy; push them away from grey.
      const mean = Math.max(0, Math.min(255, lum + (bandSum[b * 4 + k] / c - lum) * 1.8));
      switch (mode) {
        case "paper": bandRGB[b * 3 + k] = PAPER[k] * (0.88 + 0.12 * mean / 255); break;
        case "bands": bandRGB[b * 3 + k] = ramp[Math.round((b / (bands - 1)) * 255) * 3 + k]; break;
        case "dark": bandRGB[b * 3 + k] = BOARD[k] + ramp[Math.round((b / (bands - 1)) * 255) * 3 + k] * 0.08; break;
        default: bandRGB[b * 3 + k] = mean + (255 - mean) * 0.25;
      }
    }
  }

  const transition = softness * 0.99 + 0.01;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const s = S[j];
      // fwidth: forward differences (backward on the last row/column).
      const ddx = x < width - 1 ? S[j + 1] - s : s - S[j - 1];
      const ddy = y < height - 1 ? S[j + width] - s : s - S[j - width];
      const fw = Math.max(Math.abs(ddx) + Math.abs(ddy), 0.0001);
      const f = s + 0.5 - Math.floor(s + 0.5);
      const dist = Math.abs(f - 0.5) / fw;
      const lineIndex = Math.round(s);
      const lw = indexLines && lineIndex % 5 === 0 ? lineWidth * 1.9 : lineWidth;
      const inner = lw * (1 - transition);
      let t = (dist - inner) / (lw - inner);
      t = t <= 0 ? 0 : t >= 1 ? 1 : t;
      const mask = 1 - t * t * (3 - 2 * t);

      const b = Math.min(bands - 1, Math.floor(s)) * 3;
      const br = bandRGB[b], bg = bandRGB[b + 1], bb = bandRGB[b + 2];
      let lr, lg, lb;
      if (mode === "paper") { lr = INK[0]; lg = INK[1]; lb = INK[2]; }
      else if (mode === "dark") {
        const r = Math.round((0.35 + 0.65 * Math.min(1, lineIndex / levels)) * 255) * 3;
        lr = ramp[r]; lg = ramp[r + 1]; lb = ramp[r + 2];
      } else { lr = br * 0.4; lg = bg * 0.4; lb = bb * 0.4; }

      const i = j * 4;
      outputData[i] = br + (lr - br) * mask;
      outputData[i + 1] = bg + (lg - bg) * mask;
      outputData[i + 2] = bb + (lb - bb) * mask;
      outputData[i + 3] = 255;
    }
  }
}
