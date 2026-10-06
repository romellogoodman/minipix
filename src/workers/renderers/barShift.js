import { randInt, randFloat } from "../utils.js";

/**
 * Fractured bars: the image is sliced into parallel bars at an arbitrary
 * angle and each bar slides along its own length by a sub-pixel amount.
 * Bars can be uneven widths, some can stay put, and "tinted" bars split
 * their red and blue channels apart and lean toward one colour.
 */
export default function barShift({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const count = randInt(config.count, random);
  const angle = random() * Math.PI;
  const maxShift = randFloat(config.shiftPercent, random) * minDim;
  const activeFraction = randFloat(config.activeFraction, random);
  const uneven = random() < config.unevenProbability;
  const tint = random() < config.tintProbability;
  const tintFraction = randFloat(config.tintFraction, random);
  const splitPx = randFloat(config.splitPercent, random) * minDim;
  const hashSeed = (random() * 0xffffffff) >>> 0;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cx = width / 2;
  const cy = height / 2;
  // Bars are counted across the longest dimension (as in the shader), but the
  // projected axis can be as long as the diagonal, so extend the bar list.
  const half = Math.ceil(Math.hypot(width, height) / 2) + 1;
  const barWidth = Math.max(width, height) / count;
  const numBars = Math.ceil((2 * half) / barWidth) + 1;

  // Per-bar widths (uneven bars are 0.25x–1.75x), offsets, and tint.
  const shift = new Float32Array(numBars);
  const splitR = new Float32Array(numBars);
  const gain = new Float32Array(numBars * 3);
  const edges = new Float32Array(numBars + 1);
  let acc = 0;
  for (let b = 0; b < numBars; b++) {
    edges[b] = acc;
    acc += uneven ? 0.25 + 1.5 * hash(b, hashSeed, 1) : 1;
    const moving = hash(b, hashSeed, 2) < activeFraction;
    shift[b] = moving ? (hash(b, hashSeed, 3) * 2 - 1) * maxShift : 0;
    const tinted = tint && hash(b, hashSeed, 4) < tintFraction;
    splitR[b] = tinted ? (hash(b, hashSeed, 5) * 2 - 1) * splitPx : 0;
    const lean = Math.floor(hash(b, hashSeed, 6) * 3);
    for (let c = 0; c < 3; c++) gain[b * 3 + c] = tinted ? (c === lean ? 1.08 : 0.95) : 1;
  }
  edges[numBars] = acc;

  // Lookup from projected pixel coordinate (+half) to bar index.
  const lutLen = 2 * half + 1;
  const lut = new Uint16Array(lutLen);
  const scale = acc / (numBars * barWidth);
  for (let i = 0, b = 0; i < lutLen; i++) {
    const t = (i + 0.5) * scale;
    while (b < numBars - 1 && edges[b + 1] <= t) b++;
    lut[i] = b;
  }

  // Each bar moves by a constant vector, so its sample offset splits into an
  // integer texel step plus a bilinear fraction that's the same for every
  // pixel in the bar. Tabulate both per bar and channel (red/blue split apart
  // on tinted bars; green and untinted bars use the plain shift).
  const offX = new Float64Array(numBars * 3), offY = new Float64Array(numBars * 3);
  const stepI = new Int32Array(numBars * 3), stepX = new Int32Array(numBars * 3), stepY = new Int32Array(numBars * 3);
  const fxs = new Int32Array(numBars * 3), fys = new Int32Array(numBars * 3);
  for (let b = 0; b < numBars; b++) {
    const sp = splitR[b];
    for (let c = 0; c < 3; c++) {
      const k = b * 3 + c;
      const e = c === 1 ? 0 : c === 0 ? sp : -sp;
      const ox = -sinA * shift[b] + -sinA * e;
      const oy = cosA * shift[b] + cosA * e;
      offX[k] = ox;
      offY[k] = oy;
      const X = Math.round(ox * 256), Y = Math.round(oy * 256);
      stepX[k] = X >> 8;
      stepY[k] = Y >> 8;
      fxs[k] = X & 255;
      fys[k] = Y & 255;
      stepI[k] = (Y >> 8) * width + (X >> 8);
    }
  }
  // Per-bar extent of the channel steps, for one bounds check per pixel.
  const loX = new Int32Array(numBars), hiX = new Int32Array(numBars), loY = new Int32Array(numBars), hiY = new Int32Array(numBars);
  for (let b = 0; b < numBars; b++) {
    const k = b * 3;
    loX[b] = Math.min(stepX[k], stepX[k + 1], stepX[k + 2]);
    hiX[b] = Math.max(stepX[k], stepX[k + 1], stepX[k + 2]);
    loY[b] = Math.min(stepY[k], stepY[k + 1], stepY[k + 2]);
    hiY[b] = Math.max(stepY[k], stepY[k + 1], stepY[k + 2]);
  }
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const P = { cosA, sinA, cx, cy, half, lut, splitR, gain, offX, offY, stepI, stepX, stepY, fxs, fys, loX, hiX, loY, hiY };
  // One call per row: the row function optimizes as a normal function rather
  // than via on-stack replacement of one huge loop.
  for (let y = 0; y < height; y++) barsRow(imageData, src32, out32, width, height, y, P);
}

function barsRow(src, src32, out32, width, height, y, P) {
  const { cosA, sinA, cx, cy, half, lut, splitR, stepI, stepX, stepY, fxs, fys } = P;
  const maxX = width - 1, maxY = height - 1;
  const dy = y - cy;
  const row = y * width;
  let x = 0;
  while (x < width) {
    // A run of pixels in the same bar shares one sample offset.
    const b = lut[((x - cx) * cosA + dy * sinA + half) | 0];
    let xe = x + 1;
    while (xe < width && lut[((xe - cx) * cosA + dy * sinA + half) | 0] === b) xe++;
    const k = b * 3 + 1;
    if (splitR[b] === 0 && y + stepY[k] >= 0 && y + stepY[k] < maxY) {
      // Untinted: x range whose sample stays inside the image.
      const sx = stepX[k];
      const xa = Math.max(x, -sx), xb = Math.min(xe, maxX - sx);
      if (xa < xb) {
        if (x < xa) genericPixels(src, src32, out32, width, height, y, x, xa, b, P);
        const fx = fxs[k], fy = fys[k], gx = 256 - fx, gy = 256 - fy;
        const step = stepI[k];
        if ((fx | fy) === 0) {
          // Bars that stay put (or move by whole pixels): a plain copy.
          for (let p = row + xa, end = row + xb; p < end; p++) out32[p] = src32[p + step] | 0xff000000;
        } else {
          for (let p = row + xa, end = row + xb; p < end; p++) {
            // Bilinear sample in 8-bit fixed point on packed RGBA words: red
            // and blue lerp together in one word, green on its own.
            const i = p + step;
            const p00 = src32[i], p10 = src32[i + 1], p01 = src32[i + width], p11 = src32[i + width + 1];
            const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
            const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
            const rb = ((rbT * gy + rbB * fy + 0x800080) >>> 8) & 0xff00ff;
            const gT = ((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx;
            const gB = ((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx;
            out32[p] = 0xff000000 | rb | ((((gT * gy + gB * fy + 0x8000) >>> 16) & 255) << 8);
          }
        }
        if (xb < xe) genericPixels(src, src32, out32, width, height, y, xb, xe, b, P);
        x = xe;
        continue;
      }
    }
    genericPixels(src, src32, out32, width, height, y, x, xe, b, P);
    x = xe;
  }
}

// Pixels [x0, x1) of bar b in row y, channel by channel: tinted bars, and
// samples that reach past an edge (mirrored).
function genericPixels(src, src32, out32, width, height, y, x0, x1, b, P) {
  const { gain, stepI, fxs, fys, loX, hiX, loY, hiY } = P;
  const maxX = width - 1, maxY = height - 1;
  const row = y * width, k0 = b * 3;
  // Range where all three channel samples are inside the image.
  let xa = x1, xb = x1;
  if (y + loY[b] >= 0 && y + hiY[b] < maxY) {
    xa = Math.min(x1, Math.max(x0, -loX[b]));
    xb = Math.max(xa, Math.min(x1, maxX - hiX[b]));
  }
  for (let x = x0; x < xa; x++) edgePixel(src, out32, width, height, x, y, k0, P);
  const fxr = fxs[k0 + 0], fyr = fys[k0 + 0], gxr = 256 - fxr, gyr = 256 - fyr;
  const sr = stepI[k0 + 0], kr = gain[k0 + 0] / 65536;
  const fxg = fxs[k0 + 1], fyg = fys[k0 + 1], gxg = 256 - fxg, gyg = 256 - fyg;
  const sg = stepI[k0 + 1], kg = gain[k0 + 1] / 65536;
  const fxb = fxs[k0 + 2], fyb = fys[k0 + 2], gxb = 256 - fxb, gyb = 256 - fyb;
  const sb = stepI[k0 + 2], kb = gain[k0 + 2] / 65536;
  let i, q00, q10, q01, q11, v;
  for (let p = row + xa, end = row + xb; p < end; p++) {
    let packed = 0xff000000;
    i = p + sr;
    q00 = src32[i]; q10 = src32[i + 1]; q01 = src32[i + width]; q11 = src32[i + width + 1];
    v = (((q00 & 255) * gxr + (q10 & 255) * fxr) * gyr + ((q01 & 255) * gxr + (q11 & 255) * fxr) * fyr) * kr + 0.5;
    packed |= (v >= 255 ? 255 : v | 0) << 0;
    i = p + sg;
    q00 = src32[i]; q10 = src32[i + 1]; q01 = src32[i + width]; q11 = src32[i + width + 1];
    v = ((((q00 >>> 8) & 255) * gxg + ((q10 >>> 8) & 255) * fxg) * gyg + (((q01 >>> 8) & 255) * gxg + ((q11 >>> 8) & 255) * fxg) * fyg) * kg + 0.5;
    packed |= (v >= 255 ? 255 : v | 0) << 8;
    i = p + sb;
    q00 = src32[i]; q10 = src32[i + 1]; q01 = src32[i + width]; q11 = src32[i + width + 1];
    v = ((((q00 >>> 16) & 255) * gxb + ((q10 >>> 16) & 255) * fxb) * gyb + (((q01 >>> 16) & 255) * gxb + ((q11 >>> 16) & 255) * fxb) * fyb) * kb + 0.5;
    packed |= (v >= 255 ? 255 : v | 0) << 16;
    out32[p] = packed;
  }
  for (let x = xb; x < x1; x++) edgePixel(src, out32, width, height, x, y, k0, P);
}

// One pixel whose samples may reach past an edge: per channel, mirrored.
function edgePixel(src, out32, width, height, x, y, k0, P) {
  const { gain, offX, offY } = P;
  let packed = 0xff000000;
  for (let c = 0; c < 3; c++) {
    const kc = k0 + c;
    const v = sampleMirrored(src, width, height, x + offX[kc], y + offY[kc], c) * gain[kc] + 0.5;
    packed |= (v >= 255 ? 255 : v | 0) << (c * 8);
  }
  out32[y * width + x] = packed;
}

// One channel of a bilinear sample with mirrored edges (no clamp streaks).
function sampleMirrored(src, width, height, mx, my, c) {
  const maxX = width - 1, maxY = height - 1;
  if (mx < 0) mx = -mx;
  if (mx > maxX) mx = Math.max(0, 2 * maxX - mx);
  if (my < 0) my = -my;
  if (my > maxY) my = Math.max(0, 2 * maxY - my);
  const x0 = mx | 0, y0 = my | 0;
  const fx = mx - x0, fy = my - y0;
  const i00 = (y0 * width + x0) * 4 + c;
  const i10 = x0 < maxX ? i00 + 4 : i00;
  const i01 = y0 < maxY ? i00 + width * 4 : i00;
  const i11 = x0 < maxX ? i01 + 4 : i01;
  const a = src[i00], b = src[i01];
  const top = a + (src[i10] - a) * fx;
  const bot = b + (src[i11] - b) * fx;
  return top + (bot - top) * fy;
}

// Deterministic [0, 1) hash of (index, seed, salt).
function hash(i, seed, salt) {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
