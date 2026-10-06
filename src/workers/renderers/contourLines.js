import { randInt, randFloat, buildRampLUT } from "../utils.js";

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
  // The height field is smooth (σ ≈ r px), so it is built on a grid downsampled
  // by F (keeping ≥ 2 cells of blur) and upsampled per row with a cubic B-spline
  // (smooth derivatives, so the fwidth line widths stay even).
  const r = Math.max(1, Math.round(blur / 1.7));
  // F (2-4) keeps ≥ 2 cells of blur radius. The low-res blur is a box of radius
  // c plus fractional end taps α, sized so that three passes, the F×F block
  // average and the cubic B-spline upsample add up to the variance r(r+1) of three
  // full-res radius-r boxes.
  const F = Math.max(1, Math.min(4, Math.floor(r / 2)));
  let rl = r, alpha = 0;
  if (F > 1) {
    const target = (r * (r + 1) - (F * F - 1) / 12 - (F * F) / 3) / (3 * F * F); // per-pass variance
    const boxVar = (c, a) => (c * (c + 1) * (2 * c + 1) / 3 + 2 * a * (c + 1) * (c + 1)) / (2 * c + 1 + 2 * a);
    rl = 1;
    while (boxVar(rl + 1, 0) <= target) rl++;
    // boxVar is increasing in α on [0, 1]; bisect.
    let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (boxVar(rl, m) < target) lo = m; else hi = m; }
    alpha = boxVar(rl, 0) >= target ? 0 : lo;
  }
  const lw = Math.ceil(width / F), lh = Math.ceil(height / F), ln = lw * lh;
  const { lum: L, rgb: C } = downsample(imageData, width, height, F, lw, lh);
  blur3(L, lw, lh, rl, alpha);

  // pow(v, gamma) · levels + 0.5 from a fine table with linear interpolation.
  const POW_N = 16384, powLut = new Float64Array(POW_N + 2);
  for (let k = 0; k <= POW_N; k++) powLut[k] = Math.pow(k / POW_N, gamma) * levels + 0.5;
  powLut[POW_N + 1] = powLut[POW_N];

  // Mean source colour per band, for the flattened backgrounds.
  const bands = levels + 1;
  const bandSum = new Float64Array(bands * 4);
  for (let j = 0; j < ln; j++) {
    const v = invert ? 1 - L[j] : L[j];
    // +0.5 so pure black/white don't sit on a band boundary.
    const q = (v < 0 ? 0 : v > 1 ? 1 : v) * POW_N, k = q | 0;
    const s = powLut[k] + (powLut[k + 1] - powLut[k]) * (q - k);
    L[j] = s;
    const b = Math.min(bands - 1, s | 0) * 4, c = C[j * 4 + 3];
    bandSum[b] += C[j * 4]; bandSum[b + 1] += C[j * 4 + 1]; bandSum[b + 2] += C[j * 4 + 2]; bandSum[b + 3] += c;
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

  // Line colour and width per contour index (0..levels+1).
  const nLines = levels + 2;
  const lineRGB = new Float32Array(nLines * 3), lineW = new Float64Array(nLines), lineInner = new Float64Array(nLines);
  const lineFull = new Float64Array(nLines);
  const transition = softness * 0.99 + 0.01;
  for (let li = 0; li < nLines; li++) {
    const lw = indexLines && li % 5 === 0 ? lineWidth * 1.9 : lineWidth;
    lineW[li] = 1 / (lw - lw * (1 - transition));
    lineInner[li] = lw * (1 - transition);
    lineFull[li] = lw;
    if (mode === "dark") {
      const r = Math.round((0.35 + 0.65 * Math.min(1, li / levels)) * 255) * 3;
      lineRGB[li * 3] = ramp[r]; lineRGB[li * 3 + 1] = ramp[r + 1]; lineRGB[li * 3 + 2] = ramp[r + 2];
    } else if (mode === "paper") {
      lineRGB[li * 3] = INK[0]; lineRGB[li * 3 + 1] = INK[1]; lineRGB[li * 3 + 2] = INK[2];
    }
  }
  const bandLines = mode !== "dark" && mode !== "paper";

  // Cubic B-spline upsampling: grid cell centres sit at F·i + (F − 1) / 2.
  const bspline = (t, w, k) => {
    const t2 = t * t, t3 = t2 * t, u = 1 - t;
    w[k] = (u * u * u) / 6; w[k + 1] = (3 * t3 - 6 * t2 + 4) / 6;
    w[k + 2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; w[k + 3] = t3 / 6;
  };
  const XI = new Int32Array(width * 4), XW = new Float32Array(width * 4);
  for (let x = 0; x < width; x++) {
    const g = (x - (F - 1) / 2) / F, i = Math.floor(g);
    for (let k = 0; k < 4; k++) XI[x * 4 + k] = Math.max(0, Math.min(lw - 1, i - 1 + k));
    bspline(g - i, XW, x * 4);
  }
  const colRow = new Float32Array(lw), yw = new Float32Array(4);
  const upRow = F === 1 ? (y, dst) => dst.set(L.subarray(y * lw, y * lw + width)) : (y, dst) => {
    const g = (y - (F - 1) / 2) / F, i = Math.floor(g);
    bspline(g - i, yw, 0);
    const r0 = Math.max(0, Math.min(lh - 1, i - 1)) * lw, r1 = Math.max(0, Math.min(lh - 1, i)) * lw;
    const r2 = Math.max(0, Math.min(lh - 1, i + 1)) * lw, r3 = Math.max(0, Math.min(lh - 1, i + 2)) * lw;
    const w0 = yw[0], w1 = yw[1], w2 = yw[2], w3 = yw[3];
    for (let x = 0; x < lw; x++) colRow[x] = L[r0 + x] * w0 + L[r1 + x] * w1 + L[r2 + x] * w2 + L[r3 + x] * w3;
    for (let x = 0, k = 0; x < width; x++, k += 4) {
      dst[x] = colRow[XI[k]] * XW[k] + colRow[XI[k + 1]] * XW[k + 1] + colRow[XI[k + 2]] * XW[k + 2] + colRow[XI[k + 3]] * XW[k + 3];
    }
  };
  let cur = new Float32Array(width), nxt = new Float32Array(width), prv = new Float32Array(width);
  upRow(0, cur);

  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width, lastRow = y === height - 1;
    if (!lastRow) upRow(y + 1, nxt);
    for (let x = 0; x < width; x++) {
      const j = row + x;
      const s = cur[x];
      const b = (s < bands ? s | 0 : bands - 1) * 3;
      const br = bandRGB[b], bg = bandRGB[b + 1], bb = bandRGB[b + 2];
      // Distance to the nearest contour (in height units), before the fwidth divide.
      const f = s + 0.5 - ((s + 0.5) | 0);
      const df = f > 0.5 ? f - 0.5 : 0.5 - f;
      const lineIndex = (s + 0.5) | 0;
      // fwidth: forward differences (backward on the last row/column).
      const ddx = x < width - 1 ? cur[x + 1] - s : s - cur[x - 1];
      const ddy = lastRow ? s - prv[x] : nxt[x] - s;
      let fw = (ddx < 0 ? -ddx : ddx) + (ddy < 0 ? -ddy : ddy);
      fw = fw > 0.0001 ? fw : 0.0001;
      let r = br, g = bg, bl = bb;
      // On a line only when df / fw < lw (skips the divide for most pixels).
      if (df < lineFull[lineIndex] * fw) {
        let t = (df / fw - lineInner[lineIndex]) * lineW[lineIndex];
        t = t <= 0 ? 0 : t;
        const mask = 1 - t * t * (3 - 2 * t);
        let lr, lg, lb;
        if (bandLines) { lr = br * 0.4; lg = bg * 0.4; lb = bb * 0.4; }
        else { const q = lineIndex * 3; lr = lineRGB[q]; lg = lineRGB[q + 1]; lb = lineRGB[q + 2]; }
        r = br + (lr - br) * mask; g = bg + (lg - bg) * mask; bl = bb + (lb - bb) * mask;
      }
      out32[j] = 0xff000000 | (((bl + 0.5) | 0) << 16) | (((g + 0.5) | 0) << 8) | ((r + 0.5) | 0);
    }
    const t = prv; prv = cur; cur = nxt; nxt = t;
  }
}

// F×F block averages of luminance (Rec. 709, 0..1) and colour sums + pixel
// counts per cell (for the band means).
function downsample(img, w, h, F, lw, lh) {
  const lum = new Float32Array(lw * lh), rgb = new Uint32Array(lw * lh * 4);
  const src = new Uint32Array(img.buffer, img.byteOffset, w * h);
  const CX = new Int32Array(w);
  for (let x = 0; x < w; x++) CX[x] = ((x / F) | 0) * 4;
  for (let y = 0; y < h; y++) {
    const ro = ((y / F) | 0) * lw * 4, o = y * w;
    for (let x = 0; x < w; x++) {
      const p = src[o + x], c = ro + CX[x];
      rgb[c] += p & 255; rgb[c + 1] += (p >>> 8) & 255; rgb[c + 2] += (p >>> 16) & 255; rgb[c + 3]++;
    }
  }
  for (let j = 0; j < lw * lh; j++) {
    const c = j * 4;
    lum[j] = (0.2126 * rgb[c] + 0.7152 * rgb[c + 1] + 0.0722 * rgb[c + 2]) / (255 * rgb[c + 3]);
  }
  return { lum, rgb };
}

// Three in-place box blurs (radius r, clamped edges), like utils boxBlur ×3;
// end taps r + 1 get weight a (a fractional radius, for the downsampled grid).
function blur3(A, w, h, r, a) {
  const inv = 1 / (2 * r + 1 + 2 * a), B = new Float32Array(w * h);
  const row = new Float32Array(w), row2 = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    hbox(A.subarray(o, o + w), row, w, r, a, inv);
    hbox(row, row2, w, r, a, inv);
    hbox(row2, A.subarray(o, o + w), w, r, a, inv);
  }
  vbox(A, B, w, h, r, a, inv);
  vbox(B, A, w, h, r, a, inv);
  vbox(A, B, w, h, r, a, inv);
  A.set(B);
}

function hbox(src, dst, w, r, a, inv) {
  const m = w - 1;
  let s = src[0] * (r + 1);
  for (let i = 1; i <= r; i++) s += src[Math.min(i, m)];
  for (let x = 0; x < w; x++) {
    const hiE = src[Math.min(x + r + 1, m)], loE = src[Math.max(x - r - 1, 0)];
    dst[x] = (s + a * (hiE + loE)) * inv;
    s += hiE - src[Math.max(x - r, 0)];
  }
}

function vbox(src, dst, w, h, r, a, inv) {
  const acc = new Float64Array(w), m = h - 1;
  for (let x = 0; x < w; x++) {
    let s = src[x] * (r + 1);
    for (let i = 1; i <= r; i++) s += src[Math.min(i, m) * w + x];
    acc[x] = s;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w, add = Math.min(y + r + 1, m) * w, sub = Math.max(y - r, 0) * w, lo = Math.max(y - r - 1, 0) * w;
    for (let x = 0; x < w; x++) {
      const hiE = src[add + x];
      dst[o + x] = (acc[x] + a * (hiE + src[lo + x])) * inv;
      acc[x] += hiE - src[sub + x];
    }
  }
}
