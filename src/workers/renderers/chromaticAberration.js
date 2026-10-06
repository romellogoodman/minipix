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
  const invRMax = 1 / Math.max(
    Math.hypot(cx, cy), Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)
  );
  const taps = smear ? SMEAR_TAPS : 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ux = dirX * shift;
      let uy = dirY * shift;
      if (radial) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 0) {
          // Radial unit vector scaled by (r / rMax)^falloff.
          const s = (shift * Math.pow(r * invRMax, falloff)) / r;
          ux = dx * s;
          uy = dy * s;
        } else {
          ux = uy = 0;
        }
      }
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const ox = ux * mult[c];
        const oy = uy * mult[c];
        if (taps === 1) {
          outputData[o + c] = sample1(imageData, width, height, x + ox, y + oy, c);
        } else {
          let sum = 0;
          for (let t = 0; t < taps; t++) {
            const f = (t + 1) / taps;
            sum += sample1(imageData, width, height, x + ox * f, y + oy * f, c);
          }
          outputData[o + c] = sum / taps;
        }
      }
      outputData[o + 3] = 255;
    }
  }
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
