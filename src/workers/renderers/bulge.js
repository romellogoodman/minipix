import { randFloat } from "../utils.js";

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

// Bilinear RGB sample at an in-bounds (x, y) into rgb[0..2].
function bilinear(src, width, x, y, rgb) {
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = fx > 0 ? i00 + 4 : i00;
  const i01 = fy > 0 ? i00 + width * 4 : i00;
  const i11 = fx > 0 ? i01 + 4 : i01;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  rgb[0] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
  rgb[1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
  rgb[2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
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

  const maxX = width - 1, maxY = height - 1;
  // Pinches read weaker than bulges at the same strength, so push them harder.
  const signed = pinch ? -strength * 1.4 : strength;
  const innerRadius = radius * Math.max(1 - falloff - 0.001, 0);
  const invRadius = 1 / radius;
  const radiusSq = radius * radius;
  const lx = Math.cos(lightAngle), ly = Math.sin(lightAngle);
  const fresnelPower = 1 + 4 * (1 - rimSoftness);
  const rgb = new Float32Array(3);

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      outputData[o + 3] = 255;
      if (d2 >= radiusSq) {
        outputData[o] = imageData[o];
        outputData[o + 1] = imageData[o + 1];
        outputData[o + 2] = imageData[o + 2];
        continue;
      }

      if (sphere) {
        const nx = dx * invRadius, ny = dy * invRadius;
        const r2 = nx * nx + ny * ny;
        const z = Math.sqrt(1 - r2);
        const k = 1 / (1 + z * depth);
        bilinear(imageData, width, fold(cx + dx * k, maxX), fold(cy + dy * k, maxY), rgb);
        // Fresnel rim, biased toward the light; the 1px-ish edge blends back
        // to the untouched image.
        const len = Math.sqrt(r2) || 1;
        const dir = Math.max(0, (nx * lx + ny * ly) / len);
        const rim = Math.pow(1 - z, fresnelPower) * dir * dir * rimIntensity * 2 * 255;
        const cover = 1 - smoothstep(0.98, 1, r2);
        outputData[o] = imageData[o] + (rgb[0] + rim - imageData[o]) * cover;
        outputData[o + 1] = imageData[o + 1] + (rgb[1] + rim - imageData[o + 1]) * cover;
        outputData[o + 2] = imageData[o + 2] + (rgb[2] + rim - imageData[o + 2]) * cover;
        continue;
      }

      const dist = Math.sqrt(d2);
      const n = dist * invRadius;
      const fall = (1 - smoothstep(innerRadius, radius, dist)) * (1 - n * n);
      // < 1 samples closer to the centre (magnify), > 1 farther out (pinch).
      const scale = 1 - signed * fall;
      bilinear(imageData, width, fold(cx + dx * scale, maxX), fold(cy + dy * scale, maxY), rgb);
      outputData[o] = rgb[0];
      outputData[o + 1] = rgb[1];
      outputData[o + 2] = rgb[2];
    }
  }
}
