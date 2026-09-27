import { randomNumber, randFloat } from "../utils.js";

export default function filmGrain({ imageData, width, height, config, random, outputData }) {
  const grainIntensity = randFloat(config.grainIntensity, random);
  const tintStrength = randFloat(config.tintStrength, random);
  const contrast = randFloat(config.contrast, random);
  const vignetteStrength = randFloat(config.vignette, random);
  const scratchCount = randomNumber(config.scratchCount.min, config.scratchCount.max, random);

  // Colour-matrix tints: sepia, cool blue, warm yellow, faded green.
  const tintType = Math.floor(random() * 4);
  const tints = [
    { r: [0.393, 0.769, 0.189], g: [0.349, 0.686, 0.168], b: [0.272, 0.534, 0.131] },
    { r: [0.3, 0.4, 0.5], g: [0.35, 0.5, 0.6], b: [0.4, 0.55, 0.7] },
    { r: [0.5, 0.6, 0.2], g: [0.45, 0.55, 0.18], b: [0.3, 0.4, 0.15] },
    { r: [0.35, 0.6, 0.3], g: [0.4, 0.65, 0.35], b: [0.32, 0.5, 0.28] },
  ];
  const tint = tints[tintType];

  // Scratches are vertical, so bake their brightness per column once.
  const scratchMap = new Float32Array(width);
  for (let i = 0; i < scratchCount; i++) {
    const scratchX = Math.floor(random() * width);
    const thickness = randomNumber(1, 3, random);
    const brightness = random() < 0.5 ? 40 + random() * 40 : -(20 + random() * 30);
    for (let dx = -thickness; dx < thickness; dx++) {
      const x = scratchX + dx;
      if (x >= 0 && x < width) scratchMap[x] += brightness;
    }
  }

  const grainScale = 255 * grainIntensity;
  const vignetteMultiplier = vignetteStrength * 0.5;
  const invWidth = 2 / width;
  const invHeight = 2 / height;

  for (let y = 0; y < height; y++) {
    const vy = y * invHeight - 1;
    const vySq = vy * vy;
    const rowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const i = rowOffset + x * 4;

      let r = imageData[i];
      let g = imageData[i + 1];
      let b = imageData[i + 2];

      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      const tr = r * tint.r[0] + g * tint.r[1] + b * tint.r[2];
      const tg = r * tint.g[0] + g * tint.g[1] + b * tint.g[2];
      const tb = r * tint.b[0] + g * tint.b[1] + b * tint.b[2];
      r = r + (tr - r) * tintStrength;
      g = g + (tg - g) * tintStrength;
      b = b + (tb - b) * tintStrength;

      // Per-channel grain, so the noise has some colour.
      r += (random() - 0.5) * grainScale;
      g += (random() - 0.5) * grainScale;
      b += (random() - 0.5) * grainScale;

      // Squared falloff, so no sqrt.
      const vx = x * invWidth - 1;
      const vignette = 1 - (vx * vx + vySq) * vignetteMultiplier;
      r *= vignette;
      g *= vignette;
      b *= vignette;

      const scratchBrightness = scratchMap[x];
      r += scratchBrightness;
      g += scratchBrightness;
      b += scratchBrightness;

      outputData[i] = Math.max(0, Math.min(255, r | 0));
      outputData[i + 1] = Math.max(0, Math.min(255, g | 0));
      outputData[i + 2] = Math.max(0, Math.min(255, b | 0));
      outputData[i + 3] = 255;
    }
  }
}
