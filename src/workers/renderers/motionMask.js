import { randFloat, randInt, COLOR_RAMPS, buildRampLUT } from "../utils.js";

const RAMP_NAMES = Object.keys(COLOR_RAMPS);
// Constant fade subtracted from the trail each echo, in 0..255 units
// (Heckel's `- 0.025` on a 0..1 trail).
const TRAIL_FADE = 6;

/**
 * Frame differencing against the image itself. The picture is compared with
 * copies of itself shifted along one direction; the absolute luminance
 * difference becomes a "motion mask" that only lights up where the image
 * changes across that direction. Several shifts are accumulated with the
 * temporal-decay trick (trail = max(trail * decay - fade, current)) so edges
 * leave fading echoes, and the result is colourised through a heat ramp like
 * a thermal / motion-detector view.
 */
export default function motionMask({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const numEchoes = randInt(config.numEchoes, random);
  const step = Math.max(1, shortSide * randFloat(config.stepPercent, random));
  const threshold = randFloat(config.threshold, random) * 255;
  const gain = randFloat(config.gain, random);
  const decay = randFloat(config.decay, random);
  const dim = randFloat(config.dim, random);
  const angle = random() * Math.PI * 2;
  const ramp = COLOR_RAMPS[RAMP_NAMES[Math.floor(random() * RAMP_NAMES.length)]];
  const lut = buildRampLUT(ramp);

  const n = width * height;
  // Luminance via per-channel tables (same float products and sum order as
  // 0.299 * r + 0.587 * g + 0.114 * b, so the result is unchanged).
  const lr = new Float64Array(256), lg = new Float64Array(256), lb = new Float64Array(256);
  for (let v = 0; v < 256; v++) { lr[v] = 0.299 * v; lg[v] = 0.587 * v; lb[v] = 0.114 * v; }
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, n);
  const lum = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const c = src32[p];
    lum[p] = (lr[c & 255] + lg[(c >>> 8) & 255] + lb[(c >>> 16) & 255]) | 0;
  }

  // The trail is stored as bytes, so both halves of
  // trail = max(trail * decay - fade, current) reduce to 256-entry tables:
  // curLUT is indexed by the signed difference + 255.
  const decLUT = new Uint8Array(256);
  for (let t = 0; t < 256; t++) decLUT[t] = Math.max(0, Math.trunc(t * decay - TRAIL_FADE));
  const curLUT = new Uint8Array(511);
  for (let d = -255; d <= 255; d++) {
    curLUT[d + 255] = Math.min(255, Math.max(0, (Math.abs(d) - threshold) * gain));
  }

  // Final blend as one table per channel, indexed by (trail << 8) | source.
  const tabR = new Uint8ClampedArray(65536);
  const tabG = new Uint8ClampedArray(65536);
  const tabB = new Uint8ClampedArray(65536);
  for (let t = 0; t < 256; t++) {
    const f = t / 255;
    const l = t * 3;
    for (let v = 0; v < 256; v++) {
      const k = (t << 8) | v;
      tabR[k] = v * dim * (1 - f) + lut[l] * f;
      tabG[k] = v * dim * (1 - f) + lut[l + 1] * f;
      tabB[k] = v * dim * (1 - f) + lut[l + 2] * f;
    }
  }

  // Per echo shifts, oldest (largest) first so it decays the most by the end.
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const echoes = [];
  for (let k = numEchoes; k >= 1; k--) {
    const dx = Math.round(cosA * step * k);
    const dy = Math.round(sinA * step * k);
    // Columns whose shifted source x - dx lies inside the image.
    echoes.push({ dx, dy, xStart: Math.max(0, dx), xEnd: Math.min(width, width + dx) });
  }

  // Each output pixel only depends on its own trail, so run all echoes one
  // row at a time with the trail row kept hot in cache.
  const trail = new Uint8Array(width);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);
  for (let y = 0; y < height; y++) {
    trail.fill(0);
    const row = y * width;
    for (let e = 0; e < echoes.length; e++) {
      const { dx, dy, xStart, xEnd } = echoes[e];
      const sy = y - dy;
      const rowOk = sy >= 0 && sy < height;
      const a = rowOk ? xStart : width;
      const b = rowOk ? xEnd : width;
      for (let x = 0; x < a; x++) trail[x] = decLUT[trail[x]];
      if (a < b) {
        const src = sy * width - dx;
        for (let x = a; x < b; x++) {
          const dec = decLUT[trail[x]];
          const cur = curLUT[lum[row + x] - lum[src + x] + 255];
          trail[x] = dec > cur ? dec : cur;
        }
      }
      for (let x = b > a ? b : a; x < width; x++) trail[x] = decLUT[trail[x]];
    }
    for (let x = 0; x < width; x++) {
      const t = trail[x] << 8;
      const c = src32[row + x];
      out32[row + x] =
        0xff000000 | (tabB[t | ((c >>> 16) & 255)] << 16) | (tabG[t | ((c >>> 8) & 255)] << 8) | tabR[t | (c & 255)];
    }
  }
}
