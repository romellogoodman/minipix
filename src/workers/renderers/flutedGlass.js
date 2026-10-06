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

// Bilinear sample of one channel at an in-bounds (x, y).
function bilinear(src, width, x, y, c) {
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4 + c;
  const i10 = fx > 0 ? i00 + 4 : i00;
  const i01 = fy > 0 ? i00 + width * 4 : i00;
  const i11 = fx > 0 ? i01 + 4 : i01;
  return (src[i00] * (1 - fx) + src[i10] * fx) * (1 - fy) + (src[i01] * (1 - fx) + src[i11] * fx) * fy;
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

  const maxX = width - 1, maxY = height - 1;
  const ox = width / 2, oy = height / 2;
  const refrScale = refraction * (cell / 2);
  const ab = aberration * 0.5;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ax = x - ox, ay = y - oy;
      // u runs across the flutes, v along them.
      let fu = ax * cosA + ay * sinA;
      if (waves) fu += Math.sin((-ax * sinA + ay * cosA) * waveK) * waveAmplitude;
      const fp = fu / cell + phase;
      const cp = (fp - Math.floor(fp) - 0.5) * 2;
      const li = ((cp + 1) * 0.5 * LUT + 0.5) | 0;
      const taps = tapsL[li];

      let r = 0, g = 0, b = 0;
      for (let t = 0; t < taps; t++) {
        const du = taps === 1 ? 0 : (t + 0.5) / taps - 0.5;
        let cpt = cp + (du * 2) / cell;
        if (cpt > 1) cpt -= 2;
        else if (cpt < -1) cpt += 2;
        // Content shifts against the slope; red/blue shift a little more/less.
        const refr = -slopeAt(cpt) * refrScale;
        const bx = x + (du + refr) * cosA, by = y + (du + refr) * sinA;
        const cx = refr * ab * cosA, cy = refr * ab * sinA;
        r += bilinear(imageData, width, fold(bx + cx, maxX), fold(by + cy, maxY), 0);
        g += bilinear(imageData, width, fold(bx, maxX), fold(by, maxY), 1);
        b += bilinear(imageData, width, fold(bx - cx, maxX), fold(by - cy, maxY), 2);
      }

      const spec = specL[li];
      const inv = 1 / taps;
      const o = (y * width + x) * 4;
      outputData[o] = r * inv + spec;
      outputData[o + 1] = g * inv + spec;
      outputData[o + 2] = b * inv + spec;
      outputData[o + 3] = 255;
    }
  }
}
