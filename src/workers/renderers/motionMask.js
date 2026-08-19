import { randFloat, randInt, COLOR_RAMPS, buildRampLUT } from "../utils.js";

const RAMP_NAMES = Object.keys(COLOR_RAMPS);
// Constant fade subtracted from the trail each echo, in 0..255 units
// (Heckel's `- 0.025` on a 0..1 trail).
const TRAIL_FADE = 6;

/**
 * Frame differencing against the image itself. The picture is compared with
 * copies of itself shifted along one direction; the absolute luminance
 * difference becomes a "motion mask" that only lights up where the image
 * changes across that direction. Several shifts are accumulated with the
 * temporal-decay trick (trail = max(trail * decay - fade, current)) so edges
 * leave fading echoes, and the result is colourised through a heat ramp like
 * a thermal / motion-detector view.
 */
export default function motionMask({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const numEchoes = randInt(config.numEchoes, random);
  const step = Math.max(1, shortSide * randFloat(config.stepPercent, random));
  const threshold = randFloat(config.threshold, random) * 255;
  const gain = randFloat(config.gain, random);
  const decay = randFloat(config.decay, random);
  const dim = randFloat(config.dim, random);
  const angle = random() * Math.PI * 2;
  const ramp = COLOR_RAMPS[RAMP_NAMES[Math.floor(random() * RAMP_NAMES.length)]];
  const lut = buildRampLUT(ramp);

  const n = width * height;
  const lum = new Uint8Array(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    lum[p] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) | 0;
  }

  // Oldest (largest) shift first so it decays the most by the end.
  const trail = new Uint8Array(n);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  for (let k = numEchoes; k >= 1; k--) {
    const dx = Math.round(cosA * step * k);
    const dy = Math.round(sinA * step * k);
    for (let y = 0; y < height; y++) {
      const sy = y - dy;
      const rowOk = sy >= 0 && sy < height;
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const sx = x - dx;
        let cur = 0;
        if (rowOk && sx >= 0 && sx < width) {
          const d = Math.abs(lum[p] - lum[sy * width + sx]);
          if (d > threshold) cur = Math.min(255, (d - threshold) * gain);
        }
        const decayed = trail[p] * decay - TRAIL_FADE;
        trail[p] = decayed > cur ? decayed : cur;
      }
    }
  }

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const t = trail[p];
    const f = t / 255;
    const l = t * 3;
    outputData[i] = imageData[i] * dim * (1 - f) + lut[l] * f;
    outputData[i + 1] = imageData[i + 1] * dim * (1 - f) + lut[l + 1] * f;
    outputData[i + 2] = imageData[i + 2] * dim * (1 - f) + lut[l + 2] * f;
    outputData[i + 3] = 255;
  }
}
