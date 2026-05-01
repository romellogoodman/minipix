import { randomNumber, map } from "../utils.js";

export default function crt({ imageData, width, height, config, random, outputData }) {

  // Randomize parameters within config ranges
  const scanlineIntensity = map(
    random(),
    0,
    1,
    config.scanlineIntensity.min,
    config.scanlineIntensity.max
  );
  const scanlineCount = randomNumber(
    config.scanlineCount.min,
    config.scanlineCount.max,
    random
  );
  const brightness = map(
    random(),
    0,
    1,
    config.brightness.min,
    config.brightness.max
  );
  const contrast = map(
    random(),
    0,
    1,
    config.contrast.min,
    config.contrast.max
  );
  const saturation = map(
    random(),
    0,
    1,
    config.saturation.min,
    config.saturation.max
  );
  const bloomIntensity = map(
    random(),
    0,
    1,
    config.bloomIntensity.min,
    config.bloomIntensity.max
  );
  const bloomRadius = randomNumber(
    config.bloomRadius.min,
    config.bloomRadius.max,
    random
  );
  const rgbShift = randomNumber(
    config.rgbShift.min,
    config.rgbShift.max,
    random
  );
  const vignetteStrength = map(
    random(),
    0,
    1,
    config.vignetteStrength.min,
    config.vignetteStrength.max
  );
  const curvature = map(
    random(),
    0,
    1,
    config.curvature.min,
    config.curvature.max
  );

  // Helper to get pixel with bounds checking
  const getPixel = (data, x, y) => {
    x = Math.max(0, Math.min(width - 1, Math.floor(x)));
    y = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  // Apply curvature (barrel distortion) to remap UV coordinates
  const curveRemapUV = (x, y) => {
    // Normalize to -1 to 1
    let u = (x / width) * 2 - 1;
    let v = (y / height) * 2 - 1;

    // Apply barrel distortion
    const curveAmount = curvature * 0.25;
    const dist = u * u + v * v;
    u = u * (1 + dist * curveAmount);
    v = v * (1 + dist * curveAmount);

    // Convert back to pixel coordinates
    const newX = ((u + 1) / 2) * width;
    const newY = ((v + 1) / 2) * height;

    return { x: newX, y: newY, outOfBounds: newX < 0 || newX >= width || newY < 0 || newY >= height };
  };

  // First pass: apply curvature and RGB shift, store in temp buffer
  const tempData = new Uint8ClampedArray(imageData.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      // Apply curvature
      const curved = curveRemapUV(x, y);

      if (curved.outOfBounds) {
        // Black for out of bounds (curved screen edge)
        tempData[dstIdx] = 0;
        tempData[dstIdx + 1] = 0;
        tempData[dstIdx + 2] = 0;
        tempData[dstIdx + 3] = 255;
        continue;
      }

      // RGB shift (chromatic aberration)
      const r = getPixel(imageData, curved.x + rgbShift, curved.y)[0];
      const g = getPixel(imageData, curved.x, curved.y)[1];
      const b = getPixel(imageData, curved.x - rgbShift, curved.y)[2];

      tempData[dstIdx] = r;
      tempData[dstIdx + 1] = g;
      tempData[dstIdx + 2] = b;
      tempData[dstIdx + 3] = 255;
    }
  }

  // Second pass: separable bloom blur (horizontal then vertical) on bright pixels
  let bloomData = null;
  if (bloomIntensity > 0) {
    // Extract bright pixels for bloom
    const brightR = new Float32Array(width * height);
    const brightG = new Float32Array(width * height);
    const brightB = new Float32Array(width * height);

    for (let i = 0, j = 0; i < tempData.length; i += 4, j++) {
      const sr = tempData[i];
      const sg = tempData[i + 1];
      const sb = tempData[i + 2];
      if (sr + sg + sb > 384) {
        brightR[j] = sr;
        brightG[j] = sg;
        brightB[j] = sb;
      }
    }

    // Horizontal blur pass
    const hBlurR = new Float32Array(width * height);
    const hBlurG = new Float32Array(width * height);
    const hBlurB = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const x0 = Math.max(0, x - bloomRadius);
        const x1 = Math.min(width - 1, x + bloomRadius);
        for (let sx = x0; sx <= x1; sx++) {
          const idx = rowOffset + sx;
          sumR += brightR[idx];
          sumG += brightG[idx];
          sumB += brightB[idx];
          count++;
        }
        const idx = rowOffset + x;
        const inv = 1 / count;
        hBlurR[idx] = sumR * inv;
        hBlurG[idx] = sumG * inv;
        hBlurB[idx] = sumB * inv;
      }
    }

    // Vertical blur pass
    bloomData = { r: new Float32Array(width * height), g: new Float32Array(width * height), b: new Float32Array(width * height) };

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const y0 = Math.max(0, y - bloomRadius);
        const y1 = Math.min(height - 1, y + bloomRadius);
        for (let sy = y0; sy <= y1; sy++) {
          const idx = sy * width + x;
          sumR += hBlurR[idx];
          sumG += hBlurG[idx];
          sumB += hBlurB[idx];
          count++;
        }
        const idx = y * width + x;
        const inv = 1 / count;
        bloomData.r[idx] = sumR * inv;
        bloomData.g[idx] = sumG * inv;
        bloomData.b[idx] = sumB * inv;
      }
    }
  }

  // Third pass: combine bloom with color adjustments, scanlines, vignette
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixIdx = y * width + x;
      const dstIdx = pixIdx * 4;

      let r = tempData[dstIdx];
      let g = tempData[dstIdx + 1];
      let b = tempData[dstIdx + 2];

      // Add bloom
      if (bloomData) {
        r += bloomData.r[pixIdx] * bloomIntensity;
        g += bloomData.g[pixIdx] * bloomIntensity;
        b += bloomData.b[pixIdx] * bloomIntensity;
      }

      // Apply brightness
      r *= brightness;
      g *= brightness;
      b *= brightness;

      // Apply contrast
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      // Apply saturation
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * saturation;
      g = lum + (g - lum) * saturation;
      b = lum + (b - lum) * saturation;

      // Apply scanlines
      const scanlineY = (y / height) * scanlineCount;
      const scanlinePattern = Math.abs(Math.sin(scanlineY * Math.PI));
      const scanline = 1 - scanlinePattern * scanlineIntensity;
      r *= scanline;
      g *= scanline;
      b *= scanline;

      // Apply vignette (darkened edges)
      const vx = (x / width) * 2 - 1;
      const vy = (y / height) * 2 - 1;
      const vignetteDist = Math.max(Math.abs(vx), Math.abs(vy));
      const vignette = 1 - vignetteDist * vignetteDist * vignetteStrength;
      r *= vignette;
      g *= vignette;
      b *= vignette;

      // Clamp and store
      outputData[dstIdx] = Math.max(0, Math.min(255, Math.round(r)));
      outputData[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      outputData[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      outputData[dstIdx + 3] = 255;
    }
  }
}
