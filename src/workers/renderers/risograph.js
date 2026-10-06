import { randInt, randFloat } from "../utils.js";
import { RISO_INKS } from "./risoInks.js";

// White is a no-op under multiply; Black annihilates all other layers.
const PRINTABLE_INKS = RISO_INKS.filter((ink) => ink.name !== "White" && ink.name !== "Black");

export default function risograph({ imageData, width, height, config, random, outputData }) {
  const numLayers = randInt(config.numLayers, random);
  const grain = randFloat(config.grain, random);
  const maxOffset = Math.round(Math.min(width, height) * randFloat(config.misregistration, random));

  // Pick distinct inks and per-layer misregistration offsets + threshold bands
  const inks = [];
  const used = new Set();
  for (let i = 0; i < numLayers; i++) {
    let pick;
    do { pick = Math.floor(random() * PRINTABLE_INKS.length); } while (used.has(pick));
    used.add(pick);
    inks.push({
      color: PRINTABLE_INKS[pick].rgb,
      dx: Math.round((random() - 0.5) * 2 * maxOffset),
      dy: Math.round((random() - 0.5) * 2 * maxOffset),
      // Each layer prints where source luminance falls below its threshold.
      // Top layer threshold=1 so highlights receive at least one ink.
      threshold: (i + 1) / numLayers,
    });
  }

  // Luminance once, in 0..255 units.
  const n = width * height;
  const lum = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    lum[p] = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
  }

  // Every subset of layers multiplies to a fixed colour, so bake all 2^n
  // combinations (same multiply order as layering them one by one).
  const combos = new Int32Array(1 << numLayers);
  for (let m = 0; m < combos.length; m++) {
    let r = 255, g = 255, b = 255;
    inks.forEach((ink, l) => {
      if (m & (1 << l)) {
        r = (r * ink.color[0]) / 255;
        g = (g * ink.color[1]) / 255;
        b = (b * ink.color[2]) / 255;
      }
    });
    const c = new Uint8ClampedArray([r, g, b, 255]);
    combos[m] = new Int32Array(c.buffer)[0];
  }

  // Per-pixel grain comes from an inline xorshift32* stream seeded once from
  // the render RNG: one 32-bit draw gives an 8-bit grain value per layer.
  // noisy < threshold  <=>  lum < threshold - grain, so each layer gets a
  // 256-entry table of grain-shifted thresholds (0..255 luminance units).
  let s = (random() * 4294967296) | 0 || 1;
  const thr = inks.map((ink) => {
    const t = new Float32Array(256);
    for (let k = 0; k < 256; k++) t[k] = (ink.threshold - ((k + 0.5) / 256 - 0.5) * grain) * 255;
    return t;
  });
  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, n);

  // Layer source rows/columns are the output shifted by (dx, dy), clamped.
  const L = numLayers;
  const colIdx = inks.map((ink) => {
    const c = new Int32Array(width);
    for (let x = 0; x < width; x++) c[x] = Math.max(0, Math.min(width - 1, x - ink.dx));
    return c;
  });
  const t0 = thr[0], t1 = thr[1], t2 = thr[L > 2 ? 2 : 0], t3 = thr[L > 3 ? 3 : 0];
  const c0 = colIdx[0], c1 = colIdx[1], c2 = colIdx[L > 2 ? 2 : 0], c3 = colIdx[L > 3 ? 3 : 0];
  // Unused layers get an impossible threshold, so they never print.
  const never = new Float32Array(256).fill(-1);
  const u2 = L > 2 ? t2 : never, u3 = L > 3 ? t3 : never;

  for (let y = 0; y < height; y++) {
    const row = (l) => Math.max(0, Math.min(height - 1, y - inks[Math.min(l, L - 1)].dy)) * width;
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const o = y * width;
    for (let x = 0; x < width; x++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v = Math.imul(s, 0x2545f491);
      // Branch-free: the comparisons are grain-driven and would mispredict.
      const mask =
        (lum[r0 + c0[x]] < t0[v & 255]) |
        ((lum[r1 + c1[x]] < t1[(v >>> 8) & 255]) << 1) |
        ((lum[r2 + c2[x]] < u2[(v >>> 16) & 255]) << 2) |
        ((lum[r3 + c3[x]] < u3[v >>> 24]) << 3);
      out32[o + x] = combos[mask];
    }
  }
}
