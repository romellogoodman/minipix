import { randInt, randFloat } from "../utils.js";

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

// Bilinear RGB sample at an in-bounds (x, y), written to out[o..o+2].
function bilinear(src, width, x, y, out, o) {
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = fx > 0 ? i00 + 4 : i00;
  const i01 = fy > 0 ? i00 + width * 4 : i00;
  const i11 = fx > 0 ? i01 + 4 : i01;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
  out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
  out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Concentric rings around a random centre, each rotating the image by its
 * own random angle (after ConcentricSpin). Rotation depends only on the
 * distance from the centre, so it's tabulated per pixel of radius and the
 * pixel loop just looks up cos/sin. Ring widths are even or jittered, and
 * neighbouring rings blend over a soft seam.
 */
export default function concentricSpin({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const rings = randInt(config.rings, random);
  const maxAngle = (randFloat(config.intensity, random) * Math.PI) / 180;
  const smoothness = randFloat(config.smoothness, random);
  const cx = (0.3 + 0.4 * random()) * width;
  const cy = (0.3 + 0.4 * random()) * height;
  const uneven = random() < config.unevenProbability;

  // Rings are sized against the short side; enough of them to reach the
  // farthest corner.
  const ringWidth = shortSide / rings;
  const maxDist = Math.ceil(
    Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy))
  ) + 2;
  const bounds = [0];
  const angles = [];
  while (bounds[bounds.length - 1] < maxDist) {
    angles.push((random() * 2 - 1) * maxAngle);
    const jitter = random();
    bounds.push(bounds[bounds.length - 1] + ringWidth * (uneven ? 0.35 + 1.3 * jitter : 1));
  }
  angles.push(angles[angles.length - 1]);

  // Soft seam half-width: a fraction of the narrowest ring, never under a pixel.
  const h = Math.max(1, smoothness * 0.5 * ringWidth * (uneven ? 0.35 : 1));
  const cosL = new Float32Array(maxDist + 2);
  const sinL = new Float32Array(maxDist + 2);
  for (let d = 0, k = 0; d < cosL.length; d++) {
    while (k < angles.length - 2 && d >= bounds[k + 1]) k++;
    const lo = bounds[k], hi = bounds[k + 1];
    let a = angles[k];
    if (k > 0 && d < lo + h) a = angles[k - 1] + (angles[k] - angles[k - 1]) * smoothstep(lo - h, lo + h, d);
    else if (d > hi - h) a = angles[k] + (angles[k + 1] - angles[k]) * smoothstep(hi - h, hi + h, d);
    cosL[d] = Math.cos(a);
    sinL[d] = Math.sin(a);
  }

  const maxX = width - 1, maxY = height - 1;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = dist | 0, f = dist - i;
      const c = cosL[i] + (cosL[i + 1] - cosL[i]) * f;
      const s = sinL[i] + (sinL[i + 1] - sinL[i]) * f;
      const sx = fold(cx + c * dx - s * dy, maxX);
      const sy = fold(cy + s * dx + c * dy, maxY);
      const o = (y * width + x) * 4;
      bilinear(imageData, width, sx, sy, outputData, o);
      outputData[o + 3] = 255;
    }
  }
}
