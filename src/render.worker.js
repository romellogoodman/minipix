// Web Worker for pixel-intensive rendering operations
// This runs off the main thread to avoid blocking UI

import { createSeededRandom, randomNumber, map } from "./workerUtils.js";

// Renderer implementations for pixel-intensive operations
const renderers = {
  ripple: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const numRipples = randomNumber(
      config.numRipples.min,
      config.numRipples.max,
      random
    );
    const minDimension = Math.min(width, height);
    const amplitudePercent =
      numRipples === 1
        ? config.singleRippleAmplitudePercent
        : map(
            random(),
            0,
            1,
            config.amplitudePercent.min,
            config.amplitudePercent.max
          );
    const amplitude = minDimension * amplitudePercent;
    const frequency = map(
      random(),
      0,
      1,
      config.frequency.min,
      config.frequency.max
    );

    // Generate ripple centers with precomputed max influence radius
    // Ripples have negligible effect beyond this distance
    const maxInfluenceRadius = amplitude / frequency + amplitude;
    const ripples = [];
    for (let i = 0; i < numRipples; i++) {
      ripples.push({
        x: random() * width,
        y: random() * height,
        phase: random() * Math.PI * 2,
      });
    }

    // Center the group of ripples on the canvas
    const centroidX = ripples.reduce((sum, r) => sum + r.x, 0) / numRipples;
    const centroidY = ripples.reduce((sum, r) => sum + r.y, 0) / numRipples;
    const offsetToCenter = {
      x: width / 2 - centroidX,
      y: height / 2 - centroidY,
    };
    for (const ripple of ripples) {
      ripple.x += offsetToCenter.x;
      ripple.y += offsetToCenter.y;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let offsetX = 0;
        let offsetY = 0;

        for (const ripple of ripples) {
          const dx = x - ripple.x;
          const dy = y - ripple.y;

          // Use squared distance for initial culling (avoid expensive sqrt)
          const distSq = dx * dx + dy * dy;
          const maxRadiusSq = maxInfluenceRadius * maxInfluenceRadius;

          // Skip ripples too far away to have meaningful effect
          if (distSq > maxRadiusSq) continue;
          if (distSq === 0) continue;

          const dist = Math.sqrt(distSq);
          const wave = Math.sin(dist * frequency + ripple.phase) * amplitude;
          const invDist = 1 / dist;
          offsetX += dx * invDist * wave;
          offsetY += dy * invDist * wave;
        }

        const srcX = Math.floor(Math.max(0, Math.min(width - 1, x + offsetX)));
        const srcY = Math.floor(Math.max(0, Math.min(height - 1, y + offsetY)));

        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;

        outputData[dstIdx] = imageData[srcIdx];
        outputData[dstIdx + 1] = imageData[srcIdx + 1];
        outputData[dstIdx + 2] = imageData[srcIdx + 2];
        outputData[dstIdx + 3] = 255;
      }
    }

    return outputData;
  },

  spiral: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const spiralStrength = map(
      random(),
      0,
      1,
      config.spiralStrength.min,
      config.spiralStrength.max
    );
    const oscillationFrequency = map(
      random(),
      0,
      1,
      config.oscillationFrequency.min,
      config.oscillationFrequency.max
    );
    const useOscillation = random() < config.oscillationProbability;
    const direction = random() < 0.5 ? 1 : -1;

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const twist = useOscillation
          ? Math.sin(dist * oscillationFrequency) * spiralStrength
          : spiralStrength * (1 - dist / maxRadius) * direction;
        const newAngle = angle + twist;

        const srcX = Math.floor(centerX + Math.cos(newAngle) * dist);
        const srcY = Math.floor(centerY + Math.sin(newAngle) * dist);

        const clampedSrcX = Math.max(0, Math.min(width - 1, srcX));
        const clampedSrcY = Math.max(0, Math.min(height - 1, srcY));

        const srcIdx = (clampedSrcY * width + clampedSrcX) * 4;
        const dstIdx = (y * width + x) * 4;

        outputData[dstIdx] = imageData[srcIdx];
        outputData[dstIdx + 1] = imageData[srcIdx + 1];
        outputData[dstIdx + 2] = imageData[srcIdx + 2];
        outputData[dstIdx + 3] = 255;
      }
    }

    return outputData;
  },

  waves: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const amplitude = randomNumber(
      config.amplitude.min,
      config.amplitude.max,
      random
    );
    const frequency = map(
      random(),
      0,
      1,
      config.frequency.min,
      config.frequency.max
    );
    const isVertical = random() < 0.5;
    const phase = random() * Math.PI * 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let srcX, srcY;

        if (isVertical) {
          const wave = Math.sin(y * frequency + phase) * amplitude;
          srcX = Math.floor(x + wave);
          srcY = y;
        } else {
          const wave = Math.sin(x * frequency + phase) * amplitude;
          srcX = x;
          srcY = Math.floor(y + wave);
        }

        srcX = ((srcX % width) + width) % width;
        srcY = ((srcY % height) + height) % height;

        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;

        outputData[dstIdx] = imageData[srcIdx];
        outputData[dstIdx + 1] = imageData[srcIdx + 1];
        outputData[dstIdx + 2] = imageData[srcIdx + 2];
        outputData[dstIdx + 3] = 255;
      }
    }

    return outputData;
  },

  crt: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

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

    return outputData;
  },

  posterize: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const levels = randomNumber(config.levels.min, config.levels.max, random);
    const step = 255 / levels;

    for (let i = 0; i < imageData.length; i += 4) {
      outputData[i] = Math.floor(imageData[i] / step) * step;
      outputData[i + 1] = Math.floor(imageData[i + 1] / step) * step;
      outputData[i + 2] = Math.floor(imageData[i + 2] / step) * step;
      outputData[i + 3] = 255;
    }

    return outputData;
  },

  duotone: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

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

    const color1 = hslToRgb(hue1, 0.7 * satBoost, 0.2);
    const color2 = hslToRgb(hue2, 0.8 * satBoost, 0.9);

    for (let i = 0; i < imageData.length; i += 4) {
      const lum = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;

      outputData[i] = Math.round(color1[0] + (color2[0] - color1[0]) * lum);
      outputData[i + 1] = Math.round(color1[1] + (color2[1] - color1[1]) * lum);
      outputData[i + 2] = Math.round(color1[2] + (color2[2] - color1[2]) * lum);
      outputData[i + 3] = 255;
    }

    return outputData;
  },

  filmGrain: (imageData, width, height, config, seed) => {
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
  },

  vhs: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const trackingNoise = map(random(), 0, 1, config.trackingNoise.min, config.trackingNoise.max);
    const colorBleed = randomNumber(config.colorBleed.min, config.colorBleed.max, random);
    const wobble = randomNumber(config.wobble.min, config.wobble.max, random);
    const noiseIntensity = map(random(), 0, 1, config.noiseIntensity.min, config.noiseIntensity.max);
    const noiseScale = 255 * noiseIntensity;

    // Pre-compute tracking offsets per row (O(1) lookup instead of O(trackingLines))
    const trackingOffsets = new Int16Array(height);
    const numTrackingLines = Math.floor(height * trackingNoise);
    for (let i = 0; i < numTrackingLines; i++) {
      const lineY = Math.floor(random() * height);
      const offset = Math.floor((random() - 0.5) * width * 0.1);
      // Apply offset to 3-pixel band around the line
      for (let dy = -2; dy <= 2; dy++) {
        const y = lineY + dy;
        if (y >= 0 && y < height) trackingOffsets[y] = offset;
      }
    }

    // Pre-compute wobble per row
    const wobblePhase = random() * 10;

    for (let y = 0; y < height; y++) {
      const wobbleOffset = (Math.sin(y * 0.1 + wobblePhase) * wobble) | 0;
      const totalOffset = wobbleOffset + trackingOffsets[y];
      const rowOffset = y * width;
      const scanlineDark = (y & 1) === 0;

      for (let x = 0; x < width; x++) {
        const dstIdx = (rowOffset + x) * 4;

        // Apply wobble and tracking offset
        const srcX = ((x + totalOffset) % width + width) % width;

        // Color bleed: offset R and B channels
        const srcXR = ((srcX + colorBleed) % width + width) % width;
        const srcXB = ((srcX - colorBleed) % width + width) % width;

        const srcIdxR = (rowOffset + srcXR) * 4;
        const srcIdxG = (rowOffset + srcX) * 4;
        const srcIdxB = (rowOffset + srcXB) * 4;

        let r = imageData[srcIdxR];
        let g = imageData[srcIdxG + 1];
        let b = imageData[srcIdxB + 2];

        // Add noise
        const noise = (random() - 0.5) * noiseScale;
        r += noise;
        g += noise;
        b += noise;

        // Scanline darkening (use bitwise for even check)
        if (scanlineDark) {
          r *= 0.9;
          g *= 0.9;
          b *= 0.9;
        }

        outputData[dstIdx] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        outputData[dstIdx + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        outputData[dstIdx + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        outputData[dstIdx + 3] = 255;
      }
    }

    return outputData;
  },

  pixelSort: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData);

    const threshold = map(random(), 0, 1, config.threshold.min, config.threshold.max);
    const sortLengthPercent = map(random(), 0, 1, config.sortLength.min, config.sortLength.max);
    const isVertical = random() < 0.5;
    const reverse = random() < config.reverseProbability;

    const getLuminance = (idx) => {
      return (0.299 * outputData[idx] + 0.587 * outputData[idx + 1] + 0.114 * outputData[idx + 2]) / 255;
    };

    const sortFn = reverse
      ? (a, b) => b.lum - a.lum
      : (a, b) => a.lum - b.lum;

    if (isVertical) {
      for (let x = 0; x < width; x++) {
        let sortStart = -1;
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 4;
          const lum = getLuminance(idx);

          if (lum > threshold && sortStart === -1) {
            sortStart = y;
          } else if ((lum <= threshold || y === height - 1) && sortStart !== -1) {
            const sortEnd = y;
            const runLength = sortEnd - sortStart;
            const maxLen = Math.floor(runLength * sortLengthPercent);
            if (maxLen > 1) {
              const pixels = [];
              for (let sy = sortStart; sy < sortStart + maxLen; sy++) {
                const sIdx = (sy * width + x) * 4;
                pixels.push({
                  r: outputData[sIdx],
                  g: outputData[sIdx + 1],
                  b: outputData[sIdx + 2],
                  lum: getLuminance(sIdx),
                });
              }
              pixels.sort(sortFn);
              for (let i = 0; i < pixels.length; i++) {
                const sIdx = ((sortStart + i) * width + x) * 4;
                outputData[sIdx] = pixels[i].r;
                outputData[sIdx + 1] = pixels[i].g;
                outputData[sIdx + 2] = pixels[i].b;
              }
            }
            sortStart = -1;
          }
        }
      }
    } else {
      for (let y = 0; y < height; y++) {
        let sortStart = -1;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const lum = getLuminance(idx);

          if (lum > threshold && sortStart === -1) {
            sortStart = x;
          } else if ((lum <= threshold || x === width - 1) && sortStart !== -1) {
            const sortEnd = x;
            const runLength = sortEnd - sortStart;
            const maxLen = Math.floor(runLength * sortLengthPercent);
            if (maxLen > 1) {
              const pixels = [];
              for (let sx = sortStart; sx < sortStart + maxLen; sx++) {
                const sIdx = (y * width + sx) * 4;
                pixels.push({
                  r: outputData[sIdx],
                  g: outputData[sIdx + 1],
                  b: outputData[sIdx + 2],
                  lum: getLuminance(sIdx),
                });
              }
              pixels.sort(sortFn);
              for (let i = 0; i < pixels.length; i++) {
                const sIdx = (y * width + (sortStart + i)) * 4;
                outputData[sIdx] = pixels[i].r;
                outputData[sIdx + 1] = pixels[i].g;
                outputData[sIdx + 2] = pixels[i].b;
              }
            }
            sortStart = -1;
          }
        }
      }
    }

    return outputData;
  },

  oilPaint: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const radius = randomNumber(config.radius.min, config.radius.max, random);
    const levels = randomNumber(config.levels.min, config.levels.max, random);
    const saturation = map(random(), 0, 1, config.saturation.min, config.saturation.max);

    // Pre-compute constants outside the loop
    const quantStep = 256 / levels;
    const invQuantStep = 1 / quantStep;

    // Define 4 quadrant bounds once (relative offsets)
    const quadrants = [
      { x0: -radius, x1: 0, y0: -radius, y1: 0 },
      { x0: 0, x1: radius, y0: -radius, y1: 0 },
      { x0: -radius, x1: 0, y0: 0, y1: radius },
      { x0: 0, x1: radius, y0: 0, y1: radius },
    ];

    // Kuwahara filter implementation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dstIdx = (y * width + x) * 4;

        let minVariance = Infinity;
        let bestR = 0, bestG = 0, bestB = 0;

        for (let q = 0; q < 4; q++) {
          const quad = quadrants[q];
          let sumR = 0, sumG = 0, sumB = 0;
          let sumR2 = 0, sumG2 = 0, sumB2 = 0;
          let count = 0;

          for (let qy = quad.y0; qy <= quad.y1; qy++) {
            const sy = y + qy;
            if (sy < 0 || sy >= height) continue;
            const rowOffset = sy * width;

            for (let qx = quad.x0; qx <= quad.x1; qx++) {
              const sx = x + qx;
              if (sx < 0 || sx >= width) continue;
              const sIdx = (rowOffset + sx) * 4;

              const r = imageData[sIdx];
              const g = imageData[sIdx + 1];
              const b = imageData[sIdx + 2];

              sumR += r; sumG += g; sumB += b;
              sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
              count++;
            }
          }

          if (count > 0) {
            const invCount = 1 / count;
            const avgR = sumR * invCount;
            const avgG = sumG * invCount;
            const avgB = sumB * invCount;
            const variance = (sumR2 * invCount - avgR * avgR) +
                            (sumG2 * invCount - avgG * avgG) +
                            (sumB2 * invCount - avgB * avgB);

            if (variance < minVariance) {
              minVariance = variance;
              // Quantize colors for painterly effect
              bestR = ((avgR * invQuantStep) | 0) * quantStep;
              bestG = ((avgG * invQuantStep) | 0) * quantStep;
              bestB = ((avgB * invQuantStep) | 0) * quantStep;
            }
          }
        }

        // Apply saturation boost
        const lum = 0.299 * bestR + 0.587 * bestG + 0.114 * bestB;
        let r = lum + (bestR - lum) * saturation;
        let g = lum + (bestG - lum) * saturation;
        let b = lum + (bestB - lum) * saturation;

        outputData[dstIdx] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        outputData[dstIdx + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        outputData[dstIdx + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        outputData[dstIdx + 3] = 255;
      }
    }

    return outputData;
  },

  sketch: (imageData, width, height, config, seed) => {
    const random = createSeededRandom(seed);
    const outputData = new Uint8ClampedArray(imageData.length);

    const lineThickness = randomNumber(config.lineThickness.min, config.lineThickness.max, random);
    const edgeThreshold = randomNumber(config.edgeThreshold.min, config.edgeThreshold.max, random);
    const hatchingDensity = randomNumber(config.hatchingDensity.min, config.hatchingDensity.max, random);

    // Pre-compute luminance for the entire image (avoids recalculating per pixel)
    const luminance = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
      luminance[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) | 0;
    }

    // First pass: Sobel edge detection using pre-computed luminance
    const edges = new Uint16Array(width * height);
    const edgeThresholdSq = edgeThreshold * edgeThreshold;
    const halfThick = lineThickness >> 1;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      const prevRow = (y - 1) * width;
      const nextRow = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        // Unrolled Sobel kernel (faster than nested loops)
        const tl = luminance[prevRow + x - 1];
        const tc = luminance[prevRow + x];
        const tr = luminance[prevRow + x + 1];
        const ml = luminance[rowOffset + x - 1];
        const mr = luminance[rowOffset + x + 1];
        const bl = luminance[nextRow + x - 1];
        const bc = luminance[nextRow + x];
        const br = luminance[nextRow + x + 1];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

        // Store squared magnitude (avoid sqrt until needed)
        edges[rowOffset + x] = gx * gx + gy * gy;
      }
    }

    // Fill with paper color and apply effects in single pass
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const idx = (rowOffset + x) * 4;

        // Start with paper color
        let r = 250, g = 248, b = 245;

        // Check edge (compare squared values to avoid sqrt)
        const edgeSq = edges[rowOffset + x];
        if (edgeSq > edgeThresholdSq) {
          // Draw edge - use sqrt only when we need actual magnitude for darkness
          const edge = Math.sqrt(edgeSq);
          const darkness = edge * 2 > 255 ? 255 : edge * 2;
          const strokeVal = 255 - darkness;

          // Apply stroke to surrounding pixels based on thickness
          for (let dy = -halfThick; dy <= halfThick; dy++) {
            const py = y + dy;
            if (py < 0 || py >= height) continue;
            for (let dx = -halfThick; dx <= halfThick; dx++) {
              const px = x + dx;
              if (px < 0 || px >= width) continue;
              const pIdx = (py * width + px) * 4;
              if (outputData[pIdx] > strokeVal) {
                outputData[pIdx] = strokeVal;
                outputData[pIdx + 1] = strokeVal;
                outputData[pIdx + 2] = strokeVal;
                outputData[pIdx + 3] = 255;
              }
            }
          }
        }

        // Only set pixel if not already set by an edge stroke
        if (outputData[idx + 3] === 0) {
          const lum = luminance[rowOffset + x] / 255;

          // Apply hatching based on luminance
          if (lum < 0.7 && (x + y) % hatchingDensity === 0) {
            const hatchDarkness = ((1 - lum) * 100) | 0;
            r -= hatchDarkness;
            g -= hatchDarkness;
            b -= hatchDarkness;
          }
          if (lum < 0.4 && (x - y + height) % hatchingDensity === 0) {
            const hatchDarkness = ((1 - lum) * 80) | 0;
            r -= hatchDarkness;
            g -= hatchDarkness;
            b -= hatchDarkness;
          }

          outputData[idx] = r < 0 ? 0 : r;
          outputData[idx + 1] = g < 0 ? 0 : g;
          outputData[idx + 2] = b < 0 ? 0 : b;
          outputData[idx + 3] = 255;
        }
      }
    }

    return outputData;
  },
};

// Handle messages from main thread
self.onmessage = function (e) {
  const { type, rendererName, imageData, width, height, config, seed, id } =
    e.data;

  if (type === "render" && renderers[rendererName]) {
    const result = renderers[rendererName](
      imageData,
      width,
      height,
      config,
      seed
    );

    // Transfer the buffer back to avoid copying
    self.postMessage(
      { id, result: result.buffer, width, height },
      [result.buffer]
    );
  }
};
