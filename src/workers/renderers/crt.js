import { randFloat, randomNumber } from "../utils.js";

export default function crt({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const scanlineIntensity = randFloat(config.scanlineIntensity, random);
  const scanlineCount = randomNumber(config.scanlineCount.min, config.scanlineCount.max, random);
  const brightness = randFloat(config.brightness, random);
  const contrast = randFloat(config.contrast, random);
  const saturation = randFloat(config.saturation, random);
  const bloomIntensity = randFloat(config.bloomIntensity, random);
  const bloomRadius = Math.max(1, Math.round(minDim * randFloat(config.bloomRadiusPercent, random)));
  const rgbShift = Math.max(1, Math.round(minDim * randFloat(config.rgbShiftPercent, random)));
  const vignetteStrength = randFloat(config.vignetteStrength, random);
  const curvature = randFloat(config.curvature, random);

  const clampX = (v) => (v < 0 ? 0 : v >= width ? width - 1 : v | 0);
  const clampY = (v) => (v < 0 ? 0 : v >= height ? height - 1 : v | 0);

  const tempData = new Uint8ClampedArray(imageData.length);
  const curveAmount = curvature * 0.25;
  const invW = 2 / width, invH = 2 / height;

  // Pass 1: barrel distortion + RGB shift
  for (let y = 0; y < height; y++) {
    const v0 = y * invH - 1;
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const u0 = x * invW - 1;
      const dist = u0 * u0 + v0 * v0;
      const k = 1 + dist * curveAmount;
      const nx = ((u0 * k + 1) / 2) * width;
      const ny = ((v0 * k + 1) / 2) * height;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        tempData[dstIdx + 3] = 255;
        continue;
      }

      const cy = clampY(ny);
      tempData[dstIdx] = imageData[(cy * width + clampX(nx + rgbShift)) * 4];
      tempData[dstIdx + 1] = imageData[(cy * width + clampX(nx)) * 4 + 1];
      tempData[dstIdx + 2] = imageData[(cy * width + clampX(nx - rgbShift)) * 4 + 2];
      tempData[dstIdx + 3] = 255;
    }
  }

  // Pass 2: separable bloom blur on bright pixels. Reuse buffers across passes.
  const bloomR = new Float32Array(width * height);
  const bloomG = new Float32Array(width * height);
  const bloomB = new Float32Array(width * height);
  const tmpR = new Float32Array(width * height);
  const tmpG = new Float32Array(width * height);
  const tmpB = new Float32Array(width * height);

  for (let i = 0, j = 0; i < tempData.length; i += 4, j++) {
    if (tempData[i] + tempData[i + 1] + tempData[i + 2] > 384) {
      bloomR[j] = tempData[i]; bloomG[j] = tempData[i + 1]; bloomB[j] = tempData[i + 2];
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sR = 0, sG = 0, sB = 0, c = 0;
      const x0 = Math.max(0, x - bloomRadius), x1 = Math.min(width - 1, x + bloomRadius);
      for (let sx = x0; sx <= x1; sx++) { const i = row + sx; sR += bloomR[i]; sG += bloomG[i]; sB += bloomB[i]; c++; }
      const i = row + x, inv = 1 / c;
      tmpR[i] = sR * inv; tmpG[i] = sG * inv; tmpB[i] = sB * inv;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sR = 0, sG = 0, sB = 0, c = 0;
      const y0 = Math.max(0, y - bloomRadius), y1 = Math.min(height - 1, y + bloomRadius);
      for (let sy = y0; sy <= y1; sy++) { const i = sy * width + x; sR += tmpR[i]; sG += tmpG[i]; sB += tmpB[i]; c++; }
      const i = y * width + x, inv = 1 / c;
      bloomR[i] = sR * inv; bloomG[i] = sG * inv; bloomB[i] = sB * inv;
    }
  }

  // Pass 3: compose
  const scanK = (scanlineCount * Math.PI) / height;
  for (let y = 0; y < height; y++) {
    const scanline = 1 - Math.abs(Math.sin(y * scanK)) * scanlineIntensity;
    const vy = y * invH - 1;
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      const di = pi * 4;

      let r = tempData[di] + bloomR[pi] * bloomIntensity;
      let g = tempData[di + 1] + bloomG[pi] * bloomIntensity;
      let b = tempData[di + 2] + bloomB[pi] * bloomIntensity;

      r *= brightness; g *= brightness; b *= brightness;
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * saturation;
      g = lum + (g - lum) * saturation;
      b = lum + (b - lum) * saturation;

      const vx = x * invW - 1;
      const vd = Math.max(vx < 0 ? -vx : vx, vy < 0 ? -vy : vy);
      const vignette = (1 - vd * vd * vignetteStrength) * scanline;

      outputData[di] = r * vignette;
      outputData[di + 1] = g * vignette;
      outputData[di + 2] = b * vignette;
      outputData[di + 3] = 255;
    }
  }
}
