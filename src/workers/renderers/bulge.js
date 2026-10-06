import { randFloat } from "../utils.js";

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
 * Lens warp around a random centre (after Bulge + Spherize). "lens" mode
 * scales each pixel's offset from the centre by a quadratic falloff —
 * magnifying (bulge) or, with a negative strength, pinching. "sphere" mode
 * wraps a disc onto a hemisphere bulging toward the viewer, with a fresnel
 * rim light from a random direction.
 */
export default function bulge({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const radius = shortSide * randFloat(config.radiusPercent, random);
  const strength = randFloat(config.strength, random);
  const falloff = randFloat(config.falloff, random);
  const depth = randFloat(config.sphereDepth, random);
  const rimIntensity = randFloat(config.rimIntensity, random);
  const rimSoftness = randFloat(config.rimSoftness, random);
  const cx = (0.3 + 0.4 * random()) * width;
  const cy = (0.3 + 0.4 * random()) * height;
  const pinch = random() < config.pinchProbability;
  const sphere = random() < config.sphereProbability;
  const lightAngle = random() * Math.PI * 2;

  // Pinches read weaker than bulges at the same strength, so push them harder.
  const signed = pinch ? -strength * 1.4 : strength;
  const innerRadius = radius * Math.max(1 - falloff - 0.001, 0);
  const invRadius = 1 / radius;
  const radiusSq = radius * radius;
  const lx = Math.cos(lightAngle), ly = Math.sin(lightAngle);
  const fresnelPower = 1 + 4 * (1 - rimSoftness);
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  // Fresnel rim strength as a function of the sphere height z (pow per pixel
  // is the costliest part of the sphere), linearly interpolated.
  const RIM_LUT = 4096;
  const rimL = new Float32Array(RIM_LUT + 2);
  for (let i = 0; i <= RIM_LUT + 1; i++) rimL[i] = Math.pow(Math.max(0, 1 - i / RIM_LUT), fresnelPower) * rimIntensity * 2 * 255;
  const params = { cx, cy, radius, radiusSq, invRadius, innerRadius, signed, sphere, depth, lx, ly, rimL, RIM_LUT };
  // One call per row: the row function optimizes as a normal function rather
  // than via on-stack replacement of one huge loop.
  for (let y = 0; y < height; y++) bulgeRow(src32, out32, width, height, y, params);
}

function bulgeRow(src32, out32, width, height, y, P) {
  const { cx, cy, radius, radiusSq, invRadius, innerRadius, signed, sphere, depth, lx, ly, rimL, RIM_LUT } = P;
  const maxX = width - 1, maxY = height - 1;
  // Bilinear corners never step past the last row/column.
  const limX = maxX - 1 / 256, limY = maxY - 1 / 256;
  const dy = y - cy, dy2 = dy * dy;
  const row = y * width;
  // Only the span of this row inside the disc changes; copy the rest
  // (alpha forced opaque in one word: the high byte on little-endian hosts).
  let x0 = width, x1 = width;
  if (dy2 < radiusSq) {
    const half = Math.sqrt(radiusSq - dy2);
    x0 = Math.min(width, Math.max(0, Math.floor(cx - half)));
    x1 = Math.min(width, Math.max(0, Math.ceil(cx + half) + 1));
  }
  for (let x = 0; x < x0; x++) out32[row + x] = src32[row + x] | 0xff000000;
  for (let x = x1; x < width; x++) out32[row + x] = src32[row + x] | 0xff000000;

  for (let x = x0; x < x1; x++) {
    const p = row + x;
    const dx = x - cx;
    const d2 = dx * dx + dy2;
    if (d2 >= radiusSq) {
      out32[p] = src32[p] | 0xff000000;
      continue;
    }
    let sx, sy, rim = 0, cover = 1;
    if (sphere) {
      const nx = dx * invRadius, ny = dy * invRadius;
      const r2 = nx * nx + ny * ny;
      const z = Math.sqrt(1 - r2);
      const k = 1 / (1 + z * depth);
      // Fresnel rim, biased toward the light; the 1px-ish edge blends back
      // to the untouched image.
      const len = Math.sqrt(r2) || 1;
      const dir = Math.max(0, (nx * lx + ny * ly) / len);
      if (dir !== 0) {
        const zt = z * RIM_LUT, zi = zt | 0;
        rim = (rimL[zi] + (rimL[zi + 1] - rimL[zi]) * (zt - zi)) * dir * dir;
      }
      cover = 1 - smoothstep(0.98, 1, r2);
      sx = cx + dx * k;
      sy = cy + dy * k;
    } else {
      const dist = Math.sqrt(d2);
      const n = dist * invRadius;
      const fall = (1 - smoothstep(innerRadius, radius, dist)) * (1 - n * n);
      // < 1 samples closer to the centre (magnify), > 1 farther out (pinch).
      const scale = 1 - signed * fall;
      sx = cx + dx * scale;
      sy = cy + dy * scale;
    }
    if (!(sx >= 0 && sx <= maxX)) sx = fold(sx, maxX);
    if (!(sy >= 0 && sy <= maxY)) sy = fold(sy, maxY);
    if (sx > limX) sx = limX;
    if (sy > limY) sy = limY;
    // Bilinear sample in 8-bit fixed point on packed RGBA words: red and
    // blue lerp together in one word, green on its own.
    const X = (sx * 256) | 0, Y = (sy * 256) | 0;
    const fx = X & 255, fy = Y & 255, gx = 256 - fx, gy = 256 - fy;
    const i = (Y >> 8) * width + (X >> 8);
    const p00 = src32[i], p10 = src32[i + 1], p01 = src32[i + width], p11 = src32[i + width + 1];
    const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
    const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
    const rb = ((rbT * gy + rbB * fy + 0x800080) >>> 8) & 0xff00ff;
    const gT = ((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx;
    const gB = ((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx;
    const g = ((gT * gy + gB * fy + 0x8000) >>> 16) & 255;
    if (rim === 0 && cover === 1) {
      out32[p] = 0xff000000 | rb | (g << 8);
      continue;
    }
    // Sphere: add the rim light and blend the edge back to the source.
    const sp = src32[p];
    const r0 = sp & 255, g0 = (sp >>> 8) & 255, b0 = (sp >>> 16) & 255;
    let r = (r0 + ((rb & 255) + rim - r0) * cover + 0.5) | 0;
    let gg = (g0 + (g + rim - g0) * cover + 0.5) | 0;
    let b = (b0 + ((rb >>> 16) + rim - b0) * cover + 0.5) | 0;
    if (r > 255) r = 255;
    if (gg > 255) gg = 255;
    if (b > 255) b = 255;
    out32[p] = 0xff000000 | (b << 16) | (gg << 8) | r;
  }
}
