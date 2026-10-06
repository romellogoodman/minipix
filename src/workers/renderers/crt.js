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

  const tempData = new Uint8ClampedArray(imageData.length);
  const curveAmount = curvature * 0.25;
  const invW = 2 / width, invH = 2 / height;

  const bloomR = new Float32Array(width * height);
  const bloomG = new Float32Array(width * height);
  const bloomB = new Float32Array(width * height);
  const tmpR = new Float32Array(width * height);
  const tmpG = new Float32Array(width * height);
  const tmpB = new Float32Array(width * height);
  const maxX = width - 1;

  // Pass 1: barrel distortion + RGB shift, collecting the bright pixels for bloom.
  // ny is in [0, height) and nx in [0, width) past the bounds check.
  for (let y = 0; y < height; y++) {
    const v0 = y * invH - 1;
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const dstIdx = j * 4;
      const u0 = x * invW - 1;
      const dist = u0 * u0 + v0 * v0;
      const k = 1 + dist * curveAmount;
      const nx = ((u0 * k + 1) / 2) * width;
      const ny = ((v0 * k + 1) / 2) * height;

      tempData[dstIdx + 3] = 255;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const rowIdx = (ny | 0) * width;
      const xr = nx + rgbShift, xb = nx - rgbShift;
      const r = imageData[(rowIdx + (xr >= width ? maxX : xr | 0)) * 4];
      const g = imageData[(rowIdx + (nx | 0)) * 4 + 1];
      const b = imageData[(rowIdx + (xb < 0 ? 0 : xb | 0)) * 4 + 2];
      tempData[dstIdx] = r;
      tempData[dstIdx + 1] = g;
      tempData[dstIdx + 2] = b;
      if (r + g + b > 384) { bloomR[j] = r; bloomG[j] = g; bloomB[j] = b; }
    }
  }

  // Pass 2: separable box blur of the bright pixels only.
  // Running-window sums. Horizontal sums are of integers; vertical sums are of
  // float32 values (multiples of a small power of two), so both stay exact in
  // doubles and the add/subtract window gives the same result as re-summing.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sR = 0, sG = 0, sB = 0;
    for (let sx = 0, x1 = Math.min(width - 1, bloomRadius); sx <= x1; sx++) {
      const i = row + sx; sR += bloomR[i]; sG += bloomG[i]; sB += bloomB[i];
    }
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - bloomRadius), x1 = Math.min(width - 1, x + bloomRadius);
      const i = row + x, inv = 1 / (x1 - x0 + 1);
      tmpR[i] = sR * inv; tmpG[i] = sG * inv; tmpB[i] = sB * inv;
      const add = x + bloomRadius + 1, sub = x - bloomRadius;
      if (add < width) { const j = row + add; sR += bloomR[j]; sG += bloomG[j]; sB += bloomB[j]; }
      if (sub >= 0) { const j = row + sub; sR -= bloomR[j]; sG -= bloomG[j]; sB -= bloomB[j]; }
    }
  }
  const colR = new Float64Array(width), colG = new Float64Array(width), colB = new Float64Array(width);
  for (let sy = 0, y1 = Math.min(height - 1, bloomRadius); sy <= y1; sy++) {
    const row = sy * width;
    for (let x = 0; x < width; x++) { const i = row + x; colR[x] += tmpR[i]; colG[x] += tmpG[i]; colB[x] += tmpB[i]; }
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - bloomRadius), y1 = Math.min(height - 1, y + bloomRadius);
    const inv = 1 / (y1 - y0 + 1);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      bloomR[i] = colR[x] * inv; bloomG[i] = colG[x] * inv; bloomB[i] = colB[x] * inv;
    }
    const add = y + bloomRadius + 1, sub = y - bloomRadius;
    if (add < height) {
      const r = add * width;
      for (let x = 0; x < width; x++) { const j = r + x; colR[x] += tmpR[j]; colG[x] += tmpG[j]; colB[x] += tmpB[j]; }
    }
    if (sub >= 0) {
      const r = sub * width;
      for (let x = 0; x < width; x++) { const j = r + x; colR[x] -= tmpR[j]; colG[x] -= tmpG[j]; colB[x] -= tmpB[j]; }
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
