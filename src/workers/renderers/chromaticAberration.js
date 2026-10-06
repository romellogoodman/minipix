import { randFloat } from "../utils.js";

const SMEAR_TAPS = 8;

/**
 * RGB channel separation. Each channel samples the image displaced by its
 * own signed multiplier (a shuffled −1 / 0 / +1, jittered), either all along
 * one direction or radially from a lens centre so fringes grow toward the
 * edges. In smear mode each channel averages a fan of taps out to its offset,
 * giving prismatic streaks instead of crisp ghost copies.
 */
export default function chromaticAberration({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const strength = randFloat(config.strength, random);
  const radial = random() < config.radialProbability;
  const smear = random() < config.smearProbability;
  const angle = random() * Math.PI * 2;
  const cx = (0.3 + random() * 0.4) * width;
  const cy = (0.3 + random() * 0.4) * height;
  const falloff = randFloat(config.radialFalloff, random);

  // Shuffle −1/0/+1 across R/G/B, then jitter each.
  const mult = [-1, 0, 1];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [mult[i], mult[j]] = [mult[j], mult[i]];
  }
  for (let c = 0; c < 3; c++) mult[c] += (random() * 2 - 1) * config.jitter;

  const shift = strength * 0.1 * minDim;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const rMax = Math.max(
    Math.hypot(cx, cy), Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)
  );
  const taps = smear ? SMEAR_TAPS : 1;

  if (radial) {
    renderRadial(imageData, width, height, outputData, mult, taps, shift, cx, cy, rMax, falloff);
  } else {
    renderDirectional(imageData, width, height, outputData, mult, taps, dirX * shift, dirY * shift);
  }
}

// Uniform shift: every tap has a constant offset, so its bilinear weights are
// constant too; pixels whose taps all land inside the image take a fast path.
function renderDirectional(src, width, height, out, mult, taps, ux, uy) {
  const maxX = width - 1;
  const maxY = height - 1;
  const W4 = width * 4;
  const n = taps * 3;
  const offX = new Float64Array(n);
  const offY = new Float64Array(n);
  const base = new Int32Array(n);
  const w00 = new Float64Array(n);
  const w10 = new Float64Array(n);
  const w01 = new Float64Array(n);
  const w11 = new Float64Array(n);
  let xLo = 0, xHi = maxX - 1, yLo = 0, yHi = maxY - 1;
  for (let c = 0; c < 3; c++) {
    for (let t = 0; t < taps; t++) {
      const f = taps === 1 ? 1 : (t + 1) / taps;
      const k = c * taps + t;
      const dx = ux * mult[c] * f;
      const dy = uy * mult[c] * f;
      const ix = Math.floor(dx);
      const iy = Math.floor(dy);
      const fx = dx - ix;
      const fy = dy - iy;
      offX[k] = dx;
      offY[k] = dy;
      base[k] = iy * W4 + ix * 4 + c;
      w00[k] = (1 - fx) * (1 - fy);
      w10[k] = fx * (1 - fy);
      w01[k] = (1 - fx) * fy;
      w11[k] = fx * fy;
      // x + ix >= 0 and x + ix + 1 <= maxX (same for y).
      xLo = Math.max(xLo, -ix);
      xHi = Math.min(xHi, maxX - 1 - ix);
      yLo = Math.max(yLo, -iy);
      yHi = Math.min(yHi, maxY - 1 - iy);
    }
  }
  if (taps > 1) {
    smearDirectional(src, width, height, out, offX, offY, taps);
    return;
  }
  // Crisp: one bilinear tap per channel with constant weights, held in locals.
  const b0 = base[0], b1 = base[1], b2 = base[2];
  const a00 = w00[0], a10 = w10[0], a01 = w01[0], a11 = w11[0];
  const c00 = w00[1], c10 = w10[1], c01 = w01[1], c11 = w11[1];
  const e00 = w00[2], e10 = w10[2], e01 = w01[2], e11 = w11[2];
  const out32 = new Uint32Array(out.buffer, out.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const rowFast = y >= yLo && y <= yHi;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (rowFast && x >= xLo && x <= xHi) {
        let i = o + b0;
        const r = src[i] * a00 + src[i + 4] * a10 + src[i + W4] * a01 + src[i + W4 + 4] * a11;
        i = o + b1;
        const g = src[i] * c00 + src[i + 4] * c10 + src[i + W4] * c01 + src[i + W4 + 4] * c11;
        i = o + b2;
        const b = src[i] * e00 + src[i + 4] * e10 + src[i + W4] * e01 + src[i + W4 + 4] * e11;
        out32[o >> 2] = ((r + 0.5) | 0) | (((g + 0.5) | 0) << 8) | (((b + 0.5) | 0) << 16) | 0xff000000;
      } else {
        for (let c = 0; c < 3; c++) out[o + c] = sample1(src, width, height, x + offX[c], y + offY[c], c);
        out[o + 3] = 255;
      }
    }
  }
}

// Smear: the average of many taps hides sub-pixel position, so each tap is
// snapped to its nearest pixel (a constant integer offset) and read directly.
function smearDirectional(src, width, height, out, offX, offY, taps) {
  const maxX = width - 1;
  const maxY = height - 1;
  const n = taps * 3;
  const off = new Int32Array(n);
  let xLo = 0, xHi = maxX, yLo = 0, yHi = maxY;
  for (let k = 0; k < n; k++) {
    const c = (k / taps) | 0;
    const ix = Math.round(offX[k]);
    const iy = Math.round(offY[k]);
    off[k] = (iy * width + ix) * 4 + c;
    xLo = Math.max(xLo, -ix);
    xHi = Math.min(xHi, maxX - ix);
    yLo = Math.max(yLo, -iy);
    yHi = Math.min(yHi, maxY - iy);
  }
  const invTaps = 1 / taps;
  for (let y = 0; y < height; y++) {
    const rowFast = y >= yLo && y <= yHi;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const o = (row + x) * 4;
      if (rowFast && x >= xLo && x <= xHi) {
        let s0 = 0, s1 = 0, s2 = 0;
        for (let t = 0; t < taps; t++) {
          s0 += src[o + off[t]];
          s1 += src[o + off[taps + t]];
          s2 += src[o + off[2 * taps + t]];
        }
        out[o] = s0 * invTaps;
        out[o + 1] = s1 * invTaps;
        out[o + 2] = s2 * invTaps;
      } else {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let k = c * taps, end = k + taps; k < end; k++) {
            sum += sample1(src, width, height, x + offX[k], y + offY[k], c);
          }
          out[o + c] = sum * invTaps;
        }
      }
      out[o + 3] = 255;
    }
  }
}

// Radial shift about (cx, cy): the (r / rMax)^falloff magnitude comes from a
// per-pixel-radius lookup table instead of a Math.pow per pixel.
function renderRadial(src, width, height, out, mult, taps, shift, cx, cy, rMax, falloff) {
  const W4 = width * 4;
  // scale[i] = shift * (r / rMax)^falloff / r at r = i, linearly interpolated.
  const size = Math.ceil(rMax) + 2;
  const scale = new Float64Array(size);
  for (let i = 1; i < size; i++) scale[i] = (shift * Math.pow(i / rMax, falloff)) / i;
  scale[0] = falloff === 1 ? shift / rMax : 0;
  const m0 = mult[0], m1 = mult[1], m2 = mult[2];
  const out32 = new Uint32Array(out.buffer, out.byteOffset, width * height);
  const invTaps = 1 / taps;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ri = r | 0;
      const s = scale[ri] + (scale[ri + 1] - scale[ri]) * (r - ri);
      const ux = dx * s;
      const uy = dy * s;
      const p = y * width + x;
      let v0, v1, v2;
      if (taps === 1) {
        v0 = sampleIn(src, width, height, W4, x + ux * m0, y + uy * m0, 0);
        v1 = sampleIn(src, width, height, W4, x + ux * m1, y + uy * m1, 1);
        v2 = sampleIn(src, width, height, W4, x + ux * m2, y + uy * m2, 2);
      } else {
        // Smear taps are averaged, so the nearest pixel is enough.
        v0 = smearRay(src, width, height, W4, x, y, ux * m0 * invTaps, uy * m0 * invTaps, taps, 0);
        v1 = smearRay(src, width, height, W4, x, y, ux * m1 * invTaps, uy * m1 * invTaps, taps, 1);
        v2 = smearRay(src, width, height, W4, x, y, ux * m2 * invTaps, uy * m2 * invTaps, taps, 2);
        v0 *= invTaps;
        v1 *= invTaps;
        v2 *= invTaps;
      }
      out32[p] = ((v0 + 0.5) | 0) | (((v1 + 0.5) | 0) << 8) | (((v2 + 0.5) | 0) << 16) | 0xff000000;
    }
  }
}

// Sum of nearest-pixel taps at (x, y) + t·(sx, sy), t = 1..taps. A straight
// ray is inside the image when both of its ends are.
function smearRay(src, width, height, W4, x, y, stepX, stepY, taps, c) {
  const ex = x + stepX * taps;
  const ey = y + stepY * taps;
  const maxX = width - 1;
  const maxY = height - 1;
  let sum = 0;
  if (ex >= 0 && ey >= 0 && ex < maxX && ey < maxY) {
    // The pixel itself is in bounds too, so every tap is.
    let px = x + 0.5;
    let py = y + 0.5;
    for (let t = 0; t < taps; t++) {
      px += stepX;
      py += stepY;
      sum += src[(py | 0) * W4 + (px | 0) * 4 + c];
    }
    return sum;
  }
  for (let t = 1; t <= taps; t++) {
    const sx = x + stepX * t;
    const sy = y + stepY * t;
    sum += sx >= 0 && sy >= 0 && sx < maxX && sy < maxY
      ? src[((sy + 0.5) | 0) * W4 + ((sx + 0.5) | 0) * 4 + c]
      : sample1(src, width, height, sx, sy, c);
  }
  return sum;
}

// Bilinear sample of one channel; interior fast path, mirrored edges otherwise.
function sampleIn(src, width, height, W4, sx, sy, c) {
  if (sx >= 0 && sy >= 0 && sx < width - 1 && sy < height - 1) {
    const x0 = sx | 0;
    const y0 = sy | 0;
    const fx = sx - x0;
    const fy = sy - y0;
    const i = y0 * W4 + x0 * 4 + c;
    const a = src[i];
    const b = src[i + W4];
    const top = a + (src[i + 4] - a) * fx;
    return top + (b + (src[i + W4 + 4] - b) * fx - top) * fy;
  }
  return sample1(src, width, height, sx, sy, c);
}

// Bilinear sample of one channel with mirrored edges.
function sample1(src, width, height, x, y, c) {
  const maxX = width - 1;
  const maxY = height - 1;
  if (x < 0) x = -x;
  if (x > maxX) x = Math.max(0, 2 * maxX - x);
  if (y < 0) y = -y;
  if (y > maxY) y = Math.max(0, 2 * maxY - y);
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4 + c;
  const i10 = x0 < maxX ? i00 + 4 : i00;
  const i01 = y0 < maxY ? i00 + width * 4 : i00;
  const i11 = x0 < maxX ? i01 + 4 : i01;
  const a = src[i00];
  const b = src[i01];
  const top = a + (src[i10] - a) * fx;
  const bot = b + (src[i11] - b) * fx;
  return top + (bot - top) * fy;
}
