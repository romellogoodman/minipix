import { randInt, randFloat } from "../utils.js";

const SHAPES = ["bars", "rounded", "waves"];
const MAX_TAPS = 6;
const LUT = 4096;

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

/**
 * Reeded glass (after FlutedGlass): the image refracted through repeating
 * cylindrical flutes. Each flute's surface slope is a signed power curve
 * across its width — flat-faced "bars", softer "rounded", or "waves" whose
 * axis sways — and content shifts against the slope, so each flute shows a
 * squeezed, flipped-edge slice of its neighbourhood. Red and blue refract a
 * little more and less for chromatic fringes at the seams, and a Blinn
 * highlight with Fresnel catches each flute's shoulder.
 */
export default function flutedGlass({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const flutes = randInt(config.flutes, random);
  const softness = randFloat(config.softness, random);
  const refraction = randFloat(config.refraction, random);
  const aberration = randFloat(config.aberration, random);
  const highlight = randFloat(config.highlight, random);
  const highlightSoftness = randFloat(config.highlightSoftness, random);
  const lightAngle = randFloat(config.lightAngle, random);
  const waveAmplitude = randFloat(config.waveAmplitude, random) * shortSide;
  const waveFrequency = randFloat(config.waveFrequency, random);
  const shape = SHAPES[Math.floor(random() * SHAPES.length)];
  const angled = random() < config.angledProbability;
  const tilt = (0.1 + 0.8 * random()) * Math.PI;
  const phase = random();

  // 0 = vertical flutes; otherwise any direction.
  const theta = angled ? tilt : 0;
  const cosA = Math.cos(theta), sinA = Math.sin(theta);
  const cell = shortSide / flutes;
  const exponent = shape === "bars" ? 16 + (4 - 16) * softness : 8 + (3 - 8) * softness;
  const waves = shape === "waves" ? 1 : 0;
  const waveK = (waveFrequency * Math.PI * 2) / shortSide;

  // Everything about a flute depends only on the position across it (cp in
  // [-1, 1]), so tabulate the surface slope, the highlight and the tap count.
  const half = (lightAngle * Math.PI) / 360;
  const hx = Math.sin(half), hy = Math.cos(half);
  const shininess = Math.pow(2, 8 - highlightSoftness * 7);
  const slopeL = new Float32Array(LUT + 1);
  const specL = new Float32Array(LUT + 1);
  const tapsL = new Uint8Array(LUT + 1);
  for (let i = 0; i <= LUT; i++) {
    const cp = (i / LUT) * 2 - 1;
    const ac = Math.max(Math.abs(cp), 0.0001);
    const pw = Math.pow(ac, exponent - 1);
    const slope = (cp < 0 ? -1 : 1) * pw * ac;
    slopeL[i] = slope;
    // Blinn-Phong with Schlick Fresnel over the 1D slope (as the source's blinnHighlight).
    const nz = Math.sqrt(1 - Math.min(slope * slope, 1));
    const fres = 1 - nz;
    specL[i] = Math.pow(Math.max(slope * hx + nz * hy, 0), shininess) * (0.04 + 0.96 * fres ** 5) * highlight * 255;
    // Extra taps where the refraction squeezes the image (the steep shoulders
    // of each flute) so the seams don't alias.
    tapsL[i] = Math.min(MAX_TAPS, Math.max(1, Math.ceil(Math.abs(1 - refraction * exponent * pw))));
  }
  const slopeAt = (cp) => {
    const t = (cp + 1) * 0.5 * LUT;
    const i = Math.min(LUT - 1, t | 0);
    return slopeL[i] + (slopeL[i + 1] - slopeL[i]) * (t - i);
  };

  const maxX = width - 1;
  const ox = width / 2;
  const refrScale = refraction * (cell / 2);
  const ab = aberration * 0.5;

  // Refraction shift of tap t at a point cp across a flute (taps from the
  // table entry nearest cp, as the tap count is).
  const tapRefr = (cp, taps, t) => {
    const du = taps === 1 ? 0 : (t + 0.5) / taps - 0.5;
    let cpt = cp + (du * 2) / cell;
    if (cpt > 1) cpt -= 2;
    else if (cpt < -1) cpt += 2;
    return -slopeAt(cpt) * refrScale;
  };

  if (theta === 0 && !waves) {
    // Vertical, straight flutes: the mapping only moves pixels sideways and
    // is the same in every row, so build each column's horizontal resampling
    // weights once (exact positions) and apply them row by row.
    verticalFlutes(imageData, outputData, width, height, cell, phase, ox, ab, maxX, tapsL, specL, tapRefr);
    return;
  }

  // General case. Each tap's refraction shift is tabulated at both ends of
  // every LUT cell (with that cell's tap count) and interpolated, instead of
  // re-evaluating the slope curve per tap per pixel.
  const refrLo = new Float32Array((LUT + 1) * MAX_TAPS);
  const refrHi = new Float32Array((LUT + 1) * MAX_TAPS);
  for (let li = 0; li <= LUT; li++) {
    const cpc = (li / LUT) * 2 - 1, taps = tapsL[li];
    for (let t = 0; t < taps; t++) {
      refrLo[li * MAX_TAPS + t] = tapRefr(Math.max(-1, cpc - 1 / LUT), taps, t);
      refrHi[li * MAX_TAPS + t] = tapRefr(Math.min(1, cpc + 1 / LUT), taps, t);
    }
  }
  // sin() of the along-flute coordinate (waves) from a table.
  const vHalf = Math.ceil(Math.hypot(width, height) / 2) + 2;
  const SIN_RES = 4;
  const sinT = new Float32Array(waves ? 2 * vHalf * SIN_RES + 2 : 1);
  if (waves) for (let i = 0; i < sinT.length; i++) sinT[i] = Math.sin((i / SIN_RES - vHalf) * waveK) * waveAmplitude;
  generalFlutes(imageData, outputData, width, height, cosA, sinA, waves, sinT, vHalf * SIN_RES, SIN_RES, cell, phase, ab, tapsL, specL, refrLo, refrHi);
}

function generalFlutes(src, out, width, height, cosA, sinA, waves, sinT, vOff, sinRes, cell, phase, ab, tapsL, specL, refrLo, refrHi) {
  const invCell = 1 / cell;
  const src32 = new Uint32Array(src.buffer, src.byteOffset, width * height);
  const out32 = new Uint32Array(out.buffer, out.byteOffset, width * height);
  // One call per row: the row function gets optimized as a normal function
  // with full type feedback, rather than via on-stack replacement of one huge loop.
  for (let y = 0; y < height; y++) {
    flutesRow(src32, out32, width, height, y, cosA, sinA, waves, sinT, vOff, sinRes, invCell, phase, ab, tapsL, specL, refrLo, refrHi);
  }
}

function flutesRow(src32, out32, width, height, y, cosA, sinA, waves, sinT, vOff, sinRes, invCell, phase, ab, tapsL, specL, refrLo, refrHi) {
  const maxX = width - 1, maxY = height - 1;
  const ox = width / 2, oy = height / 2;
  // Bilinear corners never step past the last row/column.
  const limX = maxX - 1 / 256, limY = maxY - 1 / 256;
  let qx, qy, X, Y, fx, fy, gx, gy, i, p00, p10, p01, p11;
  const ay = y - oy;
  for (let x = 0, p = y * width; x < width; x++, p++) {
    const ax = x - ox;
    // u runs across the flutes, v along them.
    let fu = ax * cosA + ay * sinA;
    if (waves) {
      const vt = (ay * cosA - ax * sinA) * sinRes + vOff;
      const vi = vt | 0;
      fu += sinT[vi] + (sinT[vi + 1] - sinT[vi]) * (vt - vi);
    }
    const fp = fu * invCell + phase;
    const lt = (fp - Math.floor(fp)) * LUT;
    const li = (lt + 0.5) | 0;
    const sf = lt - li + 0.5;
    const taps = tapsL[li];
    const base = li * MAX_TAPS;

    if (taps === 1) {
      // Common case (the flat middle of a flute): one tap, and where the
      // colour split is under a quarter pixel one RGB sample serves all three.
      const lo = refrLo[base];
      const refr = lo + (refrHi[base] - lo) * sf;
      const e = refr * ab;
      if (e < 0.25 && e > -0.25) {
        qx = x + refr * cosA; qy = y + refr * sinA;
        if (!(qx >= 0 && qx <= limX && qy >= 0 && qy <= limY)) {
          qx = maxX - Math.abs(maxX - Math.abs(qx));
          while (qx < 0) qx = maxX - Math.abs(maxX + qx);
          qy = maxY - Math.abs(maxY - Math.abs(qy));
          while (qy < 0) qy = maxY - Math.abs(maxY + qy);
          if (qx > limX) qx = limX;
          if (qy > limY) qy = limY;
        }
        X = (qx * 256) | 0; Y = (qy * 256) | 0;
        fx = X & 255; fy = Y & 255; gx = 256 - fx; gy = 256 - fy;
        i = (Y >> 8) * width + (X >> 8);
        p00 = src32[i]; p10 = src32[i + 1]; p01 = src32[i + width]; p11 = src32[i + width + 1];
        const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
        const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
        const rb = rbT * gy + rbB * fy;
        const gg0 = (((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx) * gy + (((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx) * fy;
        const spec = specL[li] + 0.5;
        let rr = ((rb & 0xffff) / 256 + spec) | 0, gg = (gg0 / 65536 + spec) | 0, bb = ((rb >>> 16) / 256 + spec) | 0;
        if (rr > 255) rr = 255;
        if (gg > 255) gg = 255;
        if (bb > 255) bb = 255;
        out32[p] = 0xff000000 | (bb << 16) | (gg << 8) | rr;
        continue;
      }
    }

    let r = 0, g = 0, b = 0;
    for (let t = 0; t < taps; t++) {
      const lo = refrLo[base + t];
      const refr = lo + (refrHi[base + t] - lo) * sf;
      const off = (taps === 1 ? 0 : (t + 0.5) / taps - 0.5) + refr;
      const bx = x + off * cosA, by = y + off * sinA;
      // Red/blue refract a little more/less than green; where that split
      // is under a quarter pixel, one RGB sample at green's position serves all three.
      const e = refr * ab;
      if (e < 0.25 && e > -0.25) {
      qx = bx; qy = by;
      if (!(qx >= 0 && qx <= limX && qy >= 0 && qy <= limY)) {
        qx = maxX - Math.abs(maxX - Math.abs(qx));
        while (qx < 0) qx = maxX - Math.abs(maxX + qx);
        qy = maxY - Math.abs(maxY - Math.abs(qy));
        while (qy < 0) qy = maxY - Math.abs(maxY + qy);
        if (qx > limX) qx = limX;
        if (qy > limY) qy = limY;
      }
      X = (qx * 256) | 0; Y = (qy * 256) | 0;
      fx = X & 255; fy = Y & 255; gx = 256 - fx; gy = 256 - fy;
      i = (Y >> 8) * width + (X >> 8);
      p00 = src32[i]; p10 = src32[i + 1]; p01 = src32[i + width]; p11 = src32[i + width + 1];
        const rbT = ((((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff);
        const rbB = ((((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff);
        const rb = rbT * gy + rbB * fy;
        r += (rb & 0xffff) * 256;
        b += (rb >>> 16) * 256;
      g += (((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx) * gy + (((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx) * fy;
        continue;
      }
      const ex = e * cosA, ey = e * sinA;
      qx = bx + ex; qy = by + ey;
      if (!(qx >= 0 && qx <= limX && qy >= 0 && qy <= limY)) {
        qx = maxX - Math.abs(maxX - Math.abs(qx));
        while (qx < 0) qx = maxX - Math.abs(maxX + qx);
        qy = maxY - Math.abs(maxY - Math.abs(qy));
        while (qy < 0) qy = maxY - Math.abs(maxY + qy);
        if (qx > limX) qx = limX;
        if (qy > limY) qy = limY;
      }
      X = (qx * 256) | 0; Y = (qy * 256) | 0;
      fx = X & 255; fy = Y & 255; gx = 256 - fx; gy = 256 - fy;
      i = (Y >> 8) * width + (X >> 8);
      p00 = src32[i]; p10 = src32[i + 1]; p01 = src32[i + width]; p11 = src32[i + width + 1];
      r += ((p00 & 255) * gx + (p10 & 255) * fx) * gy + ((p01 & 255) * gx + (p11 & 255) * fx) * fy;
      qx = bx; qy = by;
      if (!(qx >= 0 && qx <= limX && qy >= 0 && qy <= limY)) {
        qx = maxX - Math.abs(maxX - Math.abs(qx));
        while (qx < 0) qx = maxX - Math.abs(maxX + qx);
        qy = maxY - Math.abs(maxY - Math.abs(qy));
        while (qy < 0) qy = maxY - Math.abs(maxY + qy);
        if (qx > limX) qx = limX;
        if (qy > limY) qy = limY;
      }
      X = (qx * 256) | 0; Y = (qy * 256) | 0;
      fx = X & 255; fy = Y & 255; gx = 256 - fx; gy = 256 - fy;
      i = (Y >> 8) * width + (X >> 8);
      p00 = src32[i]; p10 = src32[i + 1]; p01 = src32[i + width]; p11 = src32[i + width + 1];
      g += (((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx) * gy + (((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx) * fy;
      qx = bx - ex; qy = by - ey;
      if (!(qx >= 0 && qx <= limX && qy >= 0 && qy <= limY)) {
        qx = maxX - Math.abs(maxX - Math.abs(qx));
        while (qx < 0) qx = maxX - Math.abs(maxX + qx);
        qy = maxY - Math.abs(maxY - Math.abs(qy));
        while (qy < 0) qy = maxY - Math.abs(maxY + qy);
        if (qx > limX) qx = limX;
        if (qy > limY) qy = limY;
      }
      X = (qx * 256) | 0; Y = (qy * 256) | 0;
      fx = X & 255; fy = Y & 255; gx = 256 - fx; gy = 256 - fy;
      i = (Y >> 8) * width + (X >> 8);
      p00 = src32[i]; p10 = src32[i + 1]; p01 = src32[i + width]; p11 = src32[i + width + 1];
      b += (((p00 >>> 16) & 255) * gx + ((p10 >>> 16) & 255) * fx) * gy + (((p01 >>> 16) & 255) * gx + ((p11 >>> 16) & 255) * fx) * fy;
    }

    // Average the taps, add the highlight, round, clamp and pack.
    const spec = specL[li] + 0.5;
    const inv = 1 / (taps * 65536);
    let rr = (r * inv + spec) | 0, gg = (g * inv + spec) | 0, bb = (b * inv + spec) | 0;
    if (rr > 255) rr = 255;
    if (gg > 255) gg = 255;
    if (bb > 255) bb = 255;
    out32[p] = 0xff000000 | (bb << 16) | (gg << 8) | rr;
  }
}

// Vertical straight flutes: per-column horizontal resampling tables at the
// exact sample positions; rows then just apply them.
function verticalFlutes(src, out, width, height, cell, phase, ox, ab, maxX, tapsL, specL, tapRefr) {
  // Each tap is a pair of neighbouring texels per channel.
  const cap = width * 3 * MAX_TAPS;
  const idx = new Int32Array(cap);
  const w0 = new Float32Array(cap);
  const w1 = new Float32Array(cap);
  const base = new Int32Array(width);
  const tapsC = new Uint8Array(width);
  const spec = new Float32Array(width);
  let n = 0;
  for (let x = 0; x < width; x++) {
    const fp = (x - ox) / cell + phase;
    const cp = (fp - Math.floor(fp) - 0.5) * 2;
    const li = ((cp + 1) * 0.5 * LUT + 0.5) | 0;
    const taps = tapsL[li];
    tapsC[x] = taps;
    spec[x] = specL[li];
    base[x] = n;
    const w = 1 / taps;
    for (let c = 0; c < 3; c++) {
      for (let t = 0; t < taps; t++, n++) {
        const refr = tapRefr(cp, taps, t);
        const ch = refr * ab;
        let qx = x + (taps === 1 ? 0 : (t + 0.5) / taps - 0.5) + refr + (c === 0 ? ch : c === 2 ? -ch : 0);
        if (!(qx >= 0 && qx <= maxX)) qx = fold(qx, maxX);
        let x0 = qx | 0, fx = qx - x0;
        if (x0 >= maxX) { x0 = maxX - 1; fx = 1; }
        idx[n] = x0 * 4 + c;
        w0[n] = w * (1 - fx);
        w1[n] = w * fx;
      }
    }
  }
  const out32 = new Uint32Array(out.buffer, out.byteOffset, width * height);
  for (let y = 0; y < height; y++) verticalRow(src, out32, y * width, width, idx, w0, w1, base, tapsC, spec);
}

function verticalRow(src, out32, p0, width, idx, w0, w1, base, tapsC, spec) {
  const row = p0 * 4;
  for (let x = 0; x < width; x++) {
    const sp = spec[x] + 0.5;
    const taps = tapsC[x];
    let k = base[x], r = 0, g = 0, b = 0;
    if (taps === 1) {
      let i = row + idx[k];
      r = src[i] * w0[k] + src[i + 4] * w1[k];
      k++; i = row + idx[k];
      g = src[i] * w0[k] + src[i + 4] * w1[k];
      k++; i = row + idx[k];
      b = src[i] * w0[k] + src[i + 4] * w1[k];
    } else {
      for (let t = 0; t < taps; t++, k++) { const i = row + idx[k]; r += src[i] * w0[k] + src[i + 4] * w1[k]; }
      for (let t = 0; t < taps; t++, k++) { const i = row + idx[k]; g += src[i] * w0[k] + src[i + 4] * w1[k]; }
      for (let t = 0; t < taps; t++, k++) { const i = row + idx[k]; b += src[i] * w0[k] + src[i + 4] * w1[k]; }
    }
    // Add the highlight, round, clamp and pack.
    let rr = (r + sp) | 0, gg = (g + sp) | 0, bb = (b + sp) | 0;
    if (rr > 255) rr = 255;
    if (gg > 255) gg = 255;
    if (bb > 255) bb = 255;
    out32[p0 + x] = 0xff000000 | (bb << 16) | (gg << 8) | rr;
  }
}
