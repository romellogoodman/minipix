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

  const maxX = width - 1;
  const maxY = height - 1;
  const rowStride = width * 4;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const proj = dx * cosA + dy * sinA;
      const b = lut[(proj + half) | 0];
      // Slide along the bar (perpendicular to the projection axis).
      const s = shift[b];
      const sx = x - sinA * s;
      const sy = y + cosA * s;
      const o = (y * width + x) * 4;
      const sp = splitR[b];
      if (sp === 0) {
        // Bilinear RGB sample with mirrored edges, inlined (the call didn't
        // inline in this loop).
        let mx = sx;
        let my = sy;
        if (mx < 0) mx = -mx;
        if (mx > maxX) mx = Math.max(0, 2 * maxX - mx);
        if (my < 0) my = -my;
        if (my > maxY) my = Math.max(0, 2 * maxY - my);
        const x0 = mx | 0;
        const y0 = my | 0;
        const fx = mx - x0;
        const fy = my - y0;
        const i00 = (y0 * width + x0) * 4;
        const i10 = x0 < maxX ? i00 + 4 : i00;
        const i01 = y0 < maxY ? i00 + rowStride : i00;
        const i11 = x0 < maxX ? i01 + 4 : i01;
        for (let c = 0; c < 3; c++) {
          const a = imageData[i00 + c];
          const b = imageData[i01 + c];
          const top = a + (imageData[i10 + c] - a) * fx;
          const bot = b + (imageData[i11 + c] - b) * fx;
          outputData[o + c] = top + (bot - top) * fy;
        }
      } else {
        const g = b * 3;
        const ox = -sinA * sp;
        const oy = cosA * sp;
        // Red, green and blue each sample their own offset point.
        for (let c = 0; c < 3; c++) {
          let mx = c === 1 ? sx : c === 0 ? sx + ox : sx - ox;
          let my = c === 1 ? sy : c === 0 ? sy + oy : sy - oy;
          if (mx < 0) mx = -mx;
          if (mx > maxX) mx = Math.max(0, 2 * maxX - mx);
          if (my < 0) my = -my;
          if (my > maxY) my = Math.max(0, 2 * maxY - my);
          const x0 = mx | 0;
          const y0 = my | 0;
          const fx = mx - x0;
          const fy = my - y0;
          const i00 = (y0 * width + x0) * 4 + c;
          const i10 = x0 < maxX ? i00 + 4 : i00;
          const i01 = y0 < maxY ? i00 + rowStride : i00;
          const i11 = x0 < maxX ? i01 + 4 : i01;
          const a = imageData[i00];
          const b = imageData[i01];
          const top = a + (imageData[i10] - a) * fx;
          const bot = b + (imageData[i11] - b) * fx;
          outputData[o + c] = (top + (bot - top) * fy) * gain[g + c];
        }
      }
      outputData[o + 3] = 255;
    }
  }
}

// Deterministic [0, 1) hash of (index, seed, salt).
function hash(i, seed, salt) {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
