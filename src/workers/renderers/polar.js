import { randInt, randFloat } from "../utils.js";

const TAU = Math.PI * 2;
const MAX_TAPS = 8;
const MAX_LEVELS = 6;
const HALF_PI = Math.PI / 2;

// atan2 via a minimax polynomial on [0, 1] (max error ~1e-5 rad, i.e. a few
// hundredths of a pixel after the polar map) plus octant folding.
function fastAtan2(y, x) {
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  const mx = ax > ay ? ax : ay;
  if (mx === 0) return 0;
  const z = (ax > ay ? ay : ax) / mx;
  const z2 = z * z;
  let a = z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.0117212)))));
  if (ay > ax) a = HALF_PI - a;
  if (x < 0) a = Math.PI - a;
  return y < 0 ? -a : a;
}

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

/**
 * Polar remap (after PolarCoordinates / RectangularCoordinates).
 * "toPolar" reads the image's x as angle and y as radius around a centre —
 * the tiny-planet wrap, mirrored into `petals` repeats so there's no seam.
 * "fromPolar" does the reverse, unrolling the rings around a centre into a
 * horizontal strip. Sometimes the coordinates are only partly blended in from
 * the identity, which drags the image into a lopsided swirl.
 *
 * Both maps squeeze lots of source into a few output pixels in places (the
 * planet's core, the strip's outer edge), so each pixel takes a grid of
 * bilinear taps sized by the map's local stretch (its analytic Jacobian),
 * read from a mip level matched to the footprint's short side.
 */
export default function polar({ imageData, width, height, config, random, outputData }) {
  const petals = randInt(config.petals, random);
  const radiusScale = randFloat(config.radiusScale, random);
  const intensity = randFloat(config.intensity, random);
  const cx = (0.35 + 0.3 * random()) * width;
  const cy = (0.35 + 0.3 * random()) * height;
  const rotation = random() * TAU;
  const toPolar = random() < config.toPolarProbability;
  const invert = random() < 0.5;
  const blend = random() < config.blendProbability ? intensity : 1;

  const maxX = width - 1, maxY = height - 1;
  const maxR = Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy));
  const R = maxR * radiusScale;

  // fromPolar's angle depends only on x: tabulate cos/sin per column.
  const cosT = new Float64Array(toPolar ? 0 : width);
  const sinT = new Float64Array(toPolar ? 0 : width);
  for (let k = 0; k < cosT.length; k++) {
    const theta = (k / width) * TAU + rotation;
    cosT[k] = Math.cos(theta);
    sinT[k] = Math.sin(theta);
  }
  const keep = 1 - blend;
  const sign = invert ? -1 : 1;
  // toPolar: d(angle in mirrored turns)/d(radians), and d(v)/d(r) in px.
  const aScale = (petals * 2) / TAU;
  const uGain = maxX * aScale, vGain = (maxY / R) * sign;
  // fromPolar: d(theta)/dx and d(r)/dy.
  const dTheta = TAU / width, dR = (R / height) * sign;

  // Mip pyramid (2x2 box averages). Where the map minifies the image, taps
  // are taken from the level whose texel matches the footprint's short side,
  // so far fewer of them cover the same area.
  const levels = [{ data: imageData, w: width, h: height }];
  while (levels.length < MAX_LEVELS) {
    const prev = levels[levels.length - 1];
    if (prev.w < 2 || prev.h < 2) break;
    const w = prev.w >> 1, h = prev.h >> 1, pw = prev.w, pd = prev.data;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = ((2 * y) * pw + 2 * x) * 4, b = a + pw * 4, o = (y * w + x) * 4;
        data[o] = (pd[a] + pd[a + 4] + pd[b] + pd[b + 4] + 2) >> 2;
        data[o + 1] = (pd[a + 1] + pd[a + 5] + pd[b + 1] + pd[b + 5] + 2) >> 2;
        data[o + 2] = (pd[a + 2] + pd[a + 6] + pd[b + 2] + pd[b + 6] + 2) >> 2;
      }
    }
    levels.push({ data, w, h });
  }
  const maxLevel = levels.length - 1;
  // Each level as one little-endian RGBA word per pixel (4 loads per bilinear
  // sample instead of 12).
  const levelData = levels.map((l) =>
    l.data.byteOffset % 4 === 0
      ? new Uint32Array(l.data.buffer, l.data.byteOffset, l.w * l.h)
      : new Uint32Array(l.data.slice().buffer, 0, l.w * l.h));
  const levelW = Int32Array.from(levels, (l) => l.w);
  const levelH = Int32Array.from(levels, (l) => l.h);

  // Little-endian RGBA as one word per pixel.
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Source point (sx, sy) and the pixel's footprint there: the columns of
      // the map's Jacobian, (ux, uy) per output x and (vx, vy) per output y.
      let sx, sy, ux, uy, vx, vy;
      if (toPolar) {
        const dx = x - cx, dy = y - cy;
        const r2 = dx * dx + dy * dy || 0.25;
        const r = Math.sqrt(r2);
        // Angle in turns, mirrored `petals` times round the circle.
        let a = (fastAtan2(dy, dx) + rotation) * aScale;
        // Same as a %= 2 (each step is exact), without the slow fmod call.
        while (a >= 2) a -= 2;
        while (a <= -2) a += 2;
        if (a < 0) a += 2;
        const flip = a > 1;
        const u = flip ? 2 - a : a;
        const v = r / R;
        sx = u * maxX;
        sy = (invert ? 1 - v : v) * maxY;
        // d(angle)/dx = -dy/r², d(angle)/dy = dx/r²; d(r)/dx = dx/r, d(r)/dy = dy/r.
        const ug = (flip ? -uGain : uGain) / r2, vg = vGain / r;
        ux = -dy * ug; vx = dx * ug;
        uy = dx * vg; vy = dy * vg;
      } else {
        const c = cosT[x], sn = sinT[x];
        const r = (invert ? 1 - y / height : y / height) * R;
        sx = cx + r * c;
        sy = cy + r * sn;
        ux = -r * sn * dTheta; uy = r * c * dTheta;
        vx = c * dR; vy = sn * dR;
      }
      if (keep) {
        // Partial blend from the identity map.
        sx = x + (sx - x) * blend;
        sy = y + (sy - y) * blend;
        ux = keep + ux * blend; uy *= blend;
        vx *= blend; vy = keep + vy * blend;
      }

      const lenU = Math.sqrt(ux * ux + uy * uy), lenV = Math.sqrt(vx * vx + vy * vy);
      let minor = lenU < lenV ? lenU : lenV;
      let level = 0, sc = 1;
      while (minor >= 2 && level < maxLevel) { minor *= 0.5; sc *= 0.5; level++; }
      const src = levelData[level], lw = levelW[level];
      const lMaxX = lw - 1, lMaxY = levelH[level] - 1;
      // Level texel centres sit at (i + 0.5) / sc - 0.5 in source pixels.
      const off = 0.5 * sc - 0.5;

      // Taps per axis: the footprint in level texels, rounded, in 1..MAX_TAPS.
      const fu = lenU * sc, fv = lenV * sc;
      const nu = fu >= MAX_TAPS ? MAX_TAPS : fu < 1 ? 1 : (fu + 0.5) | 0;
      const nv = fv >= MAX_TAPS ? MAX_TAPS : fv < 1 ? 1 : (fv + 0.5) | 0;
      // Taps spread over the parallelogram the pixel covers (the angle
      // seam is mirrored, so differences stay small across it).
      let r = 0, g = 0, b = 0;
      const taps = nu * nv;
      for (let j = 0; j < nv; j++) {
        const tv = taps === 1 ? 0 : (j + 0.5) / nv - 0.5;
        for (let i = 0; i < nu; i++) {
          const tu = taps === 1 ? 0 : (i + 0.5) / nu - 0.5;
          let qx = sx + ux * tu + vx * tv, qy = sy + uy * tu + vy * tv;
          if (qx < 0 || qx > maxX) qx = fold(qx, maxX);
          if (qy < 0 || qy > maxY) qy = fold(qy, maxY);
          qx = qx * sc + off;
          qy = qy * sc + off;
          qx = qx < 0 ? 0 : qx > lMaxX ? lMaxX : qx;
          qy = qy < 0 ? 0 : qy > lMaxY ? lMaxY : qy;
          // Bilinear RGB sample at the in-bounds (qx, qy).
          const x0 = qx | 0, y0 = qy | 0;
          const fx = qx - x0, fy = qy - y0;
          const i00 = y0 * lw + x0;
          const i10 = fx > 0 ? i00 + 1 : i00;
          const i01 = fy > 0 ? i00 + lw : i00;
          const i11 = fx > 0 ? i01 + 1 : i01;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          const p00 = src[i00], p10 = src[i10], p01 = src[i01], p11 = src[i11];
          r += (p00 & 255) * w00 + (p10 & 255) * w10 + (p01 & 255) * w01 + (p11 & 255) * w11;
          g += ((p00 >> 8) & 255) * w00 + ((p10 >> 8) & 255) * w10 + ((p01 >> 8) & 255) * w01 + ((p11 >> 8) & 255) * w11;
          b += ((p00 >> 16) & 255) * w00 + ((p10 >> 16) & 255) * w10 + ((p01 >> 16) & 255) * w01 + ((p11 >> 16) & 255) * w11;
        }
      }
      const inv = 1 / taps;
      out32[y * width + x] = 0xff000000 | (((b * inv + 0.5) | 0) << 16) | (((g * inv + 0.5) | 0) << 8) | ((r * inv + 0.5) | 0);
    }
  }
}
