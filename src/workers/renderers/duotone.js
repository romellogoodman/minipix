import { map } from "../utils.js";

export default function duotone({ imageData, config, random, outputData }) {
  // Generate two contrasting colors using HSL
  const hue1 = map(random(), 0, 1, config.hueShift.min, config.hueShift.max);
  const hue2 = (hue1 + 180 + (random() - 0.5) * 60) % 360; // Complementary with variation
  const satBoost = map(random(), 0, 1, config.saturationBoost.min, config.saturationBoost.max);

  // Convert HSL to RGB helper
  const hslToRgb = (h, s, l) => {
    h /= 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  };

  const [r1, g1, b1] = hslToRgb(hue1, 0.7 * satBoost, 0.2);
  const [r2, g2, b2] = hslToRgb(hue2, 0.8 * satBoost, 0.9);
  const dr = r2 - r1, dg = g2 - g1, db = b2 - b1;

  for (let i = 0; i < imageData.length; i += 4) {
    const lum = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
    outputData[i] = r1 + dr * lum;
    outputData[i + 1] = g1 + dg * lum;
    outputData[i + 2] = b1 + db * lum;
    outputData[i + 3] = 255;
  }
}
