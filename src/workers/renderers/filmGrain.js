import { createSeededRandom, randomNumber, map } from "../utils.js";

export default function filmGrain(imageData, width, height, config, seed) {
  const random = createSeededRandom(seed);
  const outputData = new Uint8ClampedArray(imageData.length);

  const grainIntensity = map(random(), 0, 1, config.grainIntensity.min, config.grainIntensity.max);
  const tintStrength = map(random(), 0, 1, config.tintStrength.min, config.tintStrength.max);
  const contrast = map(random(), 0, 1, config.contrast.min, config.contrast.max);
  const vignetteStrength = map(random(), 0, 1, config.vignette.min, config.vignette.max);
  const scratchCount = randomNumber(config.scratchCount.min, config.scratchCount.max, random);

  // Random vintage tint (sepia, cool blue, warm yellow, faded green)
  const tintType = Math.floor(random() * 4);
  const tints = [
    { r: [0.393, 0.769, 0.189], g: [0.349, 0.686, 0.168], b: [0.272, 0.534, 0.131] }, // sepia
    { r: [0.3, 0.4, 0.5], g: [0.35, 0.5, 0.6], b: [0.4, 0.55, 0.7] }, // cool blue
    { r: [0.5, 0.6, 0.2], g: [0.45, 0.55, 0.18], b: [0.3, 0.4, 0.15] }, // warm yellow
    { r: [0.35, 0.6, 0.3], g: [0.4, 0.65, 0.35], b: [0.32, 0.5, 0.28] }, // faded green
  ];
  const tint = tints[tintType];

  // Pre-compute scratch brightness per x-column (O(width) instead of O(width*scratches) per row)
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

  // Pre-compute vignette per row for speed
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

      // Apply contrast
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      // Apply vintage tint
      const tr = r * tint.r[0] + g * tint.r[1] + b * tint.r[2];
      const tg = r * tint.g[0] + g * tint.g[1] + b * tint.g[2];
      const tb = r * tint.b[0] + g * tint.b[1] + b * tint.b[2];
      r = r + (tr - r) * tintStrength;
      g = g + (tg - g) * tintStrength;
      b = b + (tb - b) * tintStrength;

      // Add grain noise (per-channel for color variation)
      const noiseR = (random() - 0.5) * 255 * grainIntensity;
      const noiseG = (random() - 0.5) * 255 * grainIntensity;
      const noiseB = (random() - 0.5) * 255 * grainIntensity;
      r += noiseR;
      g += noiseG;
      b += noiseB;

      // Apply vignette (pre-computed y component)
      const vx = x * invWidth - 1;
      const vignetteDist = Math.sqrt(vx * vx + vySq);
      const vignette = 1 - vignetteDist * vignetteDist * vignetteMultiplier;
      r *= vignette;
      g *= vignette;
      b *= vignette;

      // Apply scratches (O(1) lookup)
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

  return outputData;
}
