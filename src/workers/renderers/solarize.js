import { randFloat, randInt } from "../utils.js";

export default function solarize({ imageData, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const strength = randFloat(config.strength, random);
  // "luma": the shader's flip of whole pixels brighter than the threshold.
  // "channel": a per-channel Sabattier curve, rising to the threshold and
  // falling back to black, which splits colours apart.
  const perChannel = random() < config.channelProbability;
  const stretch = randFloat(config.stretch, random);
  // Channel mode can fold the tone curve repeatedly, re-solarizing the
  // result for banded, psychedelic tones.
  const folds = randInt(config.folds, random);
  const hueRotate = random() < config.hueProbability;
  const hueAngle = (30 + random() * 300) * (Math.PI / 180);

  // Solarized output tops out near the threshold; stretch it back up.
  const peak = perChannel ? threshold : Math.max(threshold, 1 - threshold);
  const gain = 1 + (1 / peak - 1) * stretch;

  const n = perChannel ? folds : 1;
  const curve = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const c = v / 255;
    let s = c;
    for (let k = 0; k < n; k++) {
      s = s <= threshold ? s : threshold * (1 - s) / (1 - threshold);
      if (k < n - 1) s /= threshold;
    }
    curve[v] = (c + (s - c) * strength) * gain * 255;
  }

  // Hue rotation about the grey axis (the CSS hue-rotate matrix).
  const cos = Math.cos(hueAngle), sin = Math.sin(hueAngle);
  const m = hueRotate
    ? [
      0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
    ]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const band = 0.03; // soft edge on the luma flip, avoids aliased contours

  for (let i = 0; i < imageData.length; i += 4) {
    let r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (perChannel) {
      r = curve[r]; g = curve[g]; b = curve[b];
    } else {
      let t = (lum - threshold) / band + 0.5;
      t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const k = t * strength;
      r = (r + (255 - 2 * r) * k) * gain;
      g = (g + (255 - 2 * g) * k) * gain;
      b = (b + (255 - 2 * b) * k) * gain;
    }
    outputData[i] = m[0] * r + m[1] * g + m[2] * b;
    outputData[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    outputData[i + 2] = m[6] * r + m[7] * g + m[8] * b;
    outputData[i + 3] = 255;
  }
}
