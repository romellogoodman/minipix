import { randFloat, createNoise2D, fitSize } from "../utils.js";

const FIELD_MAX = 256;

/**
 * Grain-like diffusion (after DiffuseBlur's scatter): every pixel is read
 * from a random nearby position, so edges dissolve into sand instead of
 * softening. Offsets come from an integer hash of (x, y, seed) — square
 * like the shader, or round — and can be squashed along a random direction
 * for a brushed, rainy grain, or modulated by noise so the diffusion comes
 * and goes in patches. Out-of-bounds reads mirror back into the image.
 */
export default function diffuseBlur({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const amount = shortSide * randFloat(config.amountPercent, random);
  const disc = random() < config.discProbability;
  const stretched = random() < config.stretchProbability;
  const stretchAngle = random() * Math.PI;
  const squash = randFloat(config.squash, random);
  const patchy = random() < config.patchyProbability;
  const patchScale = randFloat(config.patchScale, random);
  const seed = (random() * 0x100000000) >>> 0;
  // Built last and unconditionally so it never shifts the RNG order above.
  const noise = createNoise2D(random);

  // Offset basis: (u, v) in [-1, 1]² maps to u·A + v·B.
  const ca = Math.cos(stretchAngle), sa = Math.sin(stretchAngle);
  const k = stretched ? squash : 1;
  const ax = ca * amount, ay = sa * amount;
  const bx = -sa * amount * k, by = ca * amount * k;

  // Low-res amount multiplier: 1 everywhere, or a two-octave noise mask
  // pushed towards 0/1 so there are clear and fully-diffused regions.
  const { w: fw, h: fh } = fitSize(width, height, FIELD_MAX);
  const mask = new Float32Array(fw * fh).fill(1);
  if (patchy) {
    const freq = patchScale / Math.max(fw, fh);
    for (let y = 0, i = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++, i++) {
        const n = noise(x * freq, y * freq) + 0.5 * noise(x * freq * 2.3 + 17, y * freq * 2.3 + 5);
        let t = n * 1.6 + 0.5;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        mask[i] = t * t * (3 - 2 * t);
      }
    }
  }
  const fsx = fw / width;
  const fsy = fh / height;
  const w2 = width * 2;
  const h2 = height * 2;

  for (let y = 0; y < height; y++) {
    const fy = ((y * fsy) | 0) * fw;
    for (let x = 0; x < width; x++) {
      // fmix32 over a combined coordinate hash.
      let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h ^= h >>> 16;
      let u = (h & 0xffff) / 32767.5 - 1;
      let v = (h >>> 16) / 32767.5 - 1;
      if (disc) {
        // Square → disc (Shirley-style radial squash keeps it uniform-ish).
        const m = Math.max(Math.abs(u), Math.abs(v));
        const len = Math.sqrt(u * u + v * v);
        if (len > 0) {
          u *= m / len;
          v *= m / len;
        }
      }
      const s = mask[fy + ((x * fsx) | 0)];
      // Exactly Math.round, but branch-free: the round-up/down choice is
      // random per pixel, so a branch here mispredicts half the time.
      const tx = x + (u * ax + v * bx) * s;
      const ty = y + (u * ay + v * by) * s;
      const cx = Math.ceil(tx);
      const cy = Math.ceil(ty);
      let sx = cx - (cx - 0.5 > tx);
      let sy = cy - (cy - 0.5 > ty);
      // Mirror edges (offsets are far smaller than the image).
      if (sx < 0) sx = -sx - 1;
      else if (sx >= width) sx = w2 - sx - 1;
      if (sy < 0) sy = -sy - 1;
      else if (sy >= height) sy = h2 - sy - 1;
      const si = (sy * width + sx) * 4;
      const o = (y * width + x) * 4;
      outputData[o] = imageData[si];
      outputData[o + 1] = imageData[si + 1];
      outputData[o + 2] = imageData[si + 2];
      outputData[o + 3] = 255;
    }
  }
}
