import { randFloat, createSeededRandom, createPermutation, noise2D } from "../utils.js";

// Paper stocks (multiplied under the print, so white becomes the paper).
const PAPERS = [
  [250, 243, 226], // cream
  [244, 236, 214], // ivory
  [238, 232, 222], // warm grey
  [236, 240, 240], // cool white
  [242, 226, 200], // aged manila
];

// Running-sum box blur (radius 1) of a single-channel buffer, in place.
function blur1(buf, tmp, w, h) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (buf[row + Math.max(0, x - 1)] + buf[row + x] + buf[row + Math.min(w - 1, x + 1)]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w, dn = Math.min(h - 1, y + 1) * w, row = y * w;
    for (let x = 0; x < w; x++) buf[row + x] = (tmp[up + x] + tmp[row + x] + tmp[dn + x]) / 3;
  }
}

export default function paperPrint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  // Grade.
  const contrast = randFloat(config.contrast, random);
  const fade = randFloat(config.fade, random);
  const saturation = randFloat(config.saturation, random);
  const warmth = randFloat(config.warmth, random); // −1 cool … +1 warm
  const splitAmount = randFloat(config.splitTone, random);
  const shadowHue = random() * Math.PI * 2;
  // Vignette, tinted toward a deep brown.
  const vignette = randFloat(config.vignette, random);
  const vRadius = randFloat(config.vignetteRadius, random);
  const vFalloff = randFloat(config.vignetteFalloff, random);
  const vcx = 0.5 + (random() - 0.5) * 0.15, vcy = 0.5 + (random() - 0.5) * 0.15;
  // Paper.
  const paper = PAPERS[Math.floor(random() * PAPERS.length)];
  const roughness = randFloat(config.roughness, random);
  const fibreDensity = randFloat(config.fibreDensity, random);
  const displacement = randFloat(config.displacement, random) * minDim / 1000;
  const tooth = randFloat(config.tooth, random);
  const foxingAmount = randFloat(config.foxing, random);
  const foxing = random() < config.foxingProbability ? foxingAmount : 0;
  // Texture building draws a variable number of values, so it gets its own
  // stream and can't shift anything above.
  const tex = createSeededRandom(Math.floor(random() * 0xffffffff));
  // createNoise2D's noise as a plain function (same 255 tex() calls, same values).
  const perm = createPermutation(tex);
  const noise = (x, y) => noise2D(perm, x, y);

  // Paper texture at ≤ 1600 px: cloudy formation (fbm) + short curved fibres.
  const ts = Math.max(1, Math.max(width, height) / 1600);
  const tw = Math.ceil(width / ts), th = Math.ceil(height / ts), tn = tw * th;
  const grain = new Float32Array(tn), stain = new Float32Array(tn), tmp = new Float32Array(tn);
  const unit = minDim / ts; // texture px per min-dimension
  const f0 = 14 / unit;
  // Formation: three octaves, each evaluated on a grid coarse enough for its
  // wavelength (≥ 8 samples per cycle) and bilinearly added into the texture.
  addOctave(grain, tw, th, perm, f0, 0.5 * 0.6);
  addOctave(grain, tw, th, perm, f0 * 2.7, 0.3 * 0.6);
  addOctave(grain, tw, th, perm, f0 * 7, 0.2 * 0.6);
  const fibres = Math.round((fibreDensity * tn) / 250);
  const fibreLen = unit * 0.012;
  for (let k = 0; k < fibres; k++) {
    let x = tex() * tw, y = tex() * th, a = tex() * Math.PI * 2;
    const bend = (tex() - 0.5) * 0.05; // gentle curl per step
    const steps = Math.ceil(fibreLen * (0.3 + tex() * 1.4) / 0.7);
    const v = (tex() < 0.6 ? 1 : -1) * (0.25 + tex() * 0.4);
    for (let s = 0; s < steps; s++) {
      const xi = x | 0, yi = y | 0;
      if (xi >= 0 && xi < tw && yi >= 0 && yi < th) grain[yi * tw + xi] += v;
      x += Math.cos(a) * 0.7; y += Math.sin(a) * 0.7; a += bend;
    }
  }
  blur1(grain, tmp, tw, th);
  // Foxing: soft rust-coloured age spots.
  const spots = Math.round(foxing * 60);
  for (let k = 0; k < spots; k++) {
    const cx = tex() * tw, cy = tex() * th, r = unit * (0.004 + tex() ** 3 * 0.03), str = 0.3 + tex() * 0.7;
    for (let y = Math.max(0, (cy - r * 2) | 0); y < Math.min(th, cy + r * 2); y++) {
      for (let x = Math.max(0, (cx - r * 2) | 0); x < Math.min(tw, cx + r * 2); x++) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
        const wobble = 1 + 0.4 * noise(x * 0.15, y * 0.15);
        stain[y * tw + x] += str * Math.exp(-d * d * wobble);
      }
    }
  }

  // Tone curve: lifted blacks, S-curve contrast, slightly rolled-off whites.
  const tone = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let c = v / 255;
    c = c + (c * c * (3 - 2 * c) - c) * (contrast - 1) * 2;
    c = Math.min(1, Math.max(0, c));
    tone[v] = fade + c * (0.97 - fade);
  }
  // White balance + split toning (shadows one hue, highlights the opposite).
  const wbR = 1 + warmth * 0.08, wbB = 1 - warmth * 0.1;
  const sR = Math.cos(shadowHue) * splitAmount, sG = Math.cos(shadowHue - 2.094) * splitAmount;
  const sB = Math.cos(shadowHue + 2.094) * splitAmount;
  const pR = paper[0] / 255, pG = paper[1] / 255, pB = paper[2] / 255;
  const aspect = width / height;
  const vIn = vRadius, vOut = vRadius + vFalloff;
  const toothScale = tooth * 0.12;
  const dispScale = displacement * ts;

  // Per-column texture taps and vignette offsets.
  const TX0 = new Int32Array(width), TX1 = new Int32Array(width), TFX = new Float32Array(width);
  const VX2 = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const tx = Math.min(tw - 1, x / ts);
    TX0[x] = tx | 0; TX1[x] = Math.min(tw - 1, (tx | 0) + 1); TFX[x] = tx - (tx | 0);
    const vx = (x / width - vcx) * aspect;
    VX2[x] = vx * vx;
  }
  const vIn2 = vIn * vIn, vSpan = 1 / (vOut - vIn);
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const kR = pR * 255, kG = pG * 255, kB = pB * 255;
  const BIAS = 1048576.5;

  for (let y = 0; y < height; y++) {
    const ty = Math.min(th - 1, y / ts);
    const ty0 = ty | 0, ty1 = Math.min(th - 1, ty0 + 1), fy = ty - ty0;
    const vy = y / height - vcy, vy2 = vy * vy;
    const ra = ty0 * tw, rc = ty1 * tw, row = y * width;
    for (let x = 0; x < width; x++) {
      const tx0 = TX0[x], tx1 = TX1[x], fx = TFX[x];
      const a = ra + tx0, b = ra + tx1, c = rc + tx0, d = rc + tx1;
      const ga = grain[a], gb = grain[b], gc = grain[c], gd = grain[d];
      const g0 = ga + (gb - ga) * fx;
      const g = g0 + (gc + (gd - gc) * fx - g0) * fy;
      // Displace the print along the fibre relief (its gradient).
      const gx = (gb - ga + gd - gc) * 0.5;
      const gy = (gc - ga + gd - gb) * 0.5;
      let sx = ((x + gx * dispScale + BIAS) | 0) - 1048576;
      let sy = ((y + gy * dispScale + BIAS) | 0) - 1048576;
      sx = sx < 0 ? 0 : sx > width - 1 ? width - 1 : sx;
      sy = sy < 0 ? 0 : sy > height - 1 ? height - 1 : sy;
      const p = src32[sy * width + sx];

      let r = tone[p & 255], gg = tone[(p >>> 8) & 255], bb = tone[(p >>> 16) & 255];
      const l = 0.299 * r + 0.587 * gg + 0.114 * bb;
      r = l + (r - l) * saturation; gg = l + (gg - l) * saturation; bb = l + (bb - l) * saturation;
      const sh = (1 - l) * (1 - l), hl = l * l, st0 = (sh - hl) * 0.5;
      r = r * wbR + sR * st0;
      gg = gg + sG * st0;
      bb = bb * wbB + sB * st0;

      // Vignette toward a dark sepia, aspect-corrected like the shader.
      const d2 = VX2[x] + vy2;
      if (d2 > vIn2) {
        let m = (Math.sqrt(d2) - vIn) * vSpan;
        m = m >= 1 ? vignette : m * m * (3 - 2 * m) * vignette;
        r += (0.16 - r) * m; gg += (0.1 - gg) * m; bb += (0.06 - bb) * m;
      }

      // Ink on paper, fibre relief, tooth and foxing.
      const st = stain[a];
      const lit = 1 + g * roughness + (random() - 0.5) * toothScale;
      let o0 = r * kR * lit * (1 - st * 0.12) + 0.5;
      let o1 = gg * kG * lit * (1 - st * 0.3) + 0.5;
      let o2 = bb * kB * lit * (1 - st * 0.5) + 0.5;
      o0 = o0 <= 0 ? 0 : o0 >= 255 ? 255 : o0 | 0;
      o1 = o1 <= 0 ? 0 : o1 >= 255 ? 255 : o1 | 0;
      o2 = o2 <= 0 ? 0 : o2 >= 255 ? 255 : o2 | 0;
      out32[row + x] = 0xff000000 | (o2 << 16) | (o1 << 8) | o0;
    }
  }
}

// grain += amp · noise(x·f, y·f), sampled every `step` texels (≥ 8 samples per
// cycle) and bilinearly interpolated in between.
function addOctave(grain, tw, th, perm, f, amp) {
  // Power-of-two step ≤ 1/8 wavelength (≤ 8 texels).
  let step = 1;
  while (step < 8 && step * 2 * 8 * f <= 1) step *= 2;
  const cw = Math.ceil((tw - 1) / step) + 1, chh = Math.ceil((th - 1) / step) + 1;
  const C = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) {
    for (let i = 0; i < cw; i++) C[j * cw + i] = noise2D(perm, i * step * f, j * step * f) * amp;
  }
  const inv = 1 / step; // steps are powers of two, so x * inv is exact
  const I0 = new Int32Array(tw), I1 = new Int32Array(tw), FX = new Float32Array(tw);
  for (let x = 0; x < tw; x++) {
    const i0 = (x * inv) | 0;
    I0[x] = i0; I1[x] = Math.min(cw - 1, i0 + 1); FX[x] = (x - i0 * step) * inv;
  }
  const rowA = new Float32Array(cw);
  for (let y = 0; y < th; y++) {
    const j0 = (y * inv) | 0, j1 = Math.min(chh - 1, j0 + 1), fy = (y - j0 * step) * inv;
    const a = j0 * cw, b = j1 * cw, o = y * tw;
    for (let i = 0; i < cw; i++) rowA[i] = C[a + i] + (C[b + i] - C[a + i]) * fy;
    for (let x = 0; x < tw; x++) {
      const i0 = I0[x], v = rowA[i0];
      grain[o + x] += v + (rowA[I1[x]] - v) * FX[x];
    }
  }
}
