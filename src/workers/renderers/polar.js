import { randInt, randFloat } from "../utils.js";

const TAU = Math.PI * 2;
const MAX_TAPS = 8;

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
 * taps sized by the map's local stretch.
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

  // Output (x, y) → unfolded source coordinate, written to pt[0..1].
  const pt = new Float64Array(2);
  // fromPolar's angle depends only on x, which is always a multiple of 0.5
  // from -0.5 to width - 0.5: tabulate cos/sin at index 2x + 1.
  const cosT = new Float64Array(toPolar ? 0 : 2 * width + 1);
  const sinT = new Float64Array(toPolar ? 0 : 2 * width + 1);
  for (let k = 0; k < cosT.length; k++) {
    const theta = (((k - 1) / 2) / width) * TAU + rotation;
    cosT[k] = Math.cos(theta);
    sinT[k] = Math.sin(theta);
  }
  // One closure for both modes keeps the call site monomorphic (inlinable).
  const map = (x, y) => {
    if (toPolar) {
      const dx = x - cx, dy = y - cy;
      // Angle in turns, mirrored `petals` times round the circle.
      let a = ((Math.atan2(dy, dx) + rotation) / TAU) * petals * 2;
      // Same as a %= 2 (each step is exact), without the slow fmod call.
      while (a >= 2) a -= 2;
      while (a <= -2) a += 2;
      if (a < 0) a += 2;
      const u = a > 1 ? 2 - a : a;
      const v = Math.sqrt(dx * dx + dy * dy) / R;
      pt[0] = x + (u * maxX - x) * blend;
      pt[1] = y + ((invert ? 1 - v : v) * maxY - y) * blend;
    } else {
      const k = (2 * x + 1) | 0;
      const r = (invert ? 1 - y / height : y / height) * R;
      pt[0] = x + (cx + r * cosT[k] - x) * blend;
      pt[1] = y + (cy + r * sinT[k] - y) * blend;
    }
  };

  const rowStride = width * 4;
  for (let y = 0; y < height; y++) {
    map(-0.5, y);
    let px = pt[0], py = pt[1];
    for (let x = 0; x < width; x++) {
      // Footprint of this pixel in source space, from finite differences.
      map(x + 0.5, y);
      const nx = pt[0], ny = pt[1];
      map(x, y + 0.5);
      const ux = nx - px, uy = ny - py;
      const vx0 = pt[0], vy0 = pt[1];
      map(x, y);
      const sx = pt[0], sy = pt[1];
      const vx = (vx0 - sx) * 2, vy = (vy0 - sy) * 2;
      px = nx; py = ny;

      const nu = Math.min(MAX_TAPS, Math.max(1, Math.ceil(Math.hypot(ux, uy))));
      const nv = Math.min(MAX_TAPS, Math.max(1, Math.ceil(Math.hypot(vx, vy))));
      // Taps spread over the parallelogram the pixel covers (the angle
      // seam is mirrored, so differences stay small across it).
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < nv; j++) {
        const tv = (j + 0.5) / nv - 0.5;
        for (let i = 0; i < nu; i++) {
          const tu = (i + 0.5) / nu - 0.5;
          const qx = fold(sx + ux * tu + vx * tv, maxX);
          const qy = fold(sy + uy * tu + vy * tv, maxY);
          // Bilinear RGB sample at the in-bounds (qx, qy).
          const x0 = qx | 0, y0 = qy | 0;
          const fx = qx - x0, fy = qy - y0;
          const i00 = (y0 * width + x0) * 4;
          const i10 = fx > 0 ? i00 + 4 : i00;
          const i01 = fy > 0 ? i00 + rowStride : i00;
          const i11 = fx > 0 ? i01 + 4 : i01;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          r += imageData[i00] * w00 + imageData[i10] * w10 + imageData[i01] * w01 + imageData[i11] * w11;
          g += imageData[i00 + 1] * w00 + imageData[i10 + 1] * w10 + imageData[i01 + 1] * w01 + imageData[i11 + 1] * w11;
          b += imageData[i00 + 2] * w00 + imageData[i10 + 2] * w10 + imageData[i01 + 2] * w01 + imageData[i11 + 2] * w11;
        }
      }
      const inv = 1 / (nu * nv);
      const o = (y * width + x) * 4;
      outputData[o] = r * inv;
      outputData[o + 1] = g * inv;
      outputData[o + 2] = b * inv;
      outputData[o + 3] = 255;
    }
  }
}
