import { randInt, randFloat } from "../utils.js";

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
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
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const dy = y - cy, dy2 = dy * dy, row = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dist = Math.sqrt(dx * dx + dy2);
      const i = dist | 0, f = dist - i;
      const c = cosL[i] + (cosL[i + 1] - cosL[i]) * f;
      const s = sinL[i] + (sinL[i + 1] - sinL[i]) * f;
      // Mirror-repeat edges: one bounce covers almost everything.
      let sx = cx + c * dx - s * dy, sy = cy + s * dx + c * dy;
      if (sx < 0) sx = -sx;
      if (sx > maxX) { sx = 2 * maxX - sx; if (sx < 0) sx = fold(sx, maxX); }
      if (sy < 0) sy = -sy;
      if (sy > maxY) { sy = 2 * maxY - sy; if (sy < 0) sy = fold(sy, maxY); }
      // Bilinear sample in 8-bit fixed point on packed RGBA words: red and
      // blue lerp together in one word, green on its own; alpha forced opaque.
      const X = (sx * 256) | 0, Y = (sy * 256) | 0;
      const fx = X & 255, fy = Y & 255;
      const k = (Y >> 8) * width + (X >> 8);
      const p00 = src32[k];
      const p10 = fx ? src32[k + 1] : p00;
      const p01 = fy ? src32[k + width] : p00;
      const p11 = fy ? (fx ? src32[k + width + 1] : p01) : p10;
      const gx = 256 - fx, gy = 256 - fy;
      const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
      const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
      const rb = ((rbT * gy + rbB * fy + 0x800080) >>> 8) & 0xff00ff;
      const gT = ((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx;
      const gB = ((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx;
      out32[row + x] = 0xff000000 | rb | ((((gT * gy + gB * fy + 0x8000) >>> 16) & 255) << 8);
    }
  }
}
