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

    // Second pass: apply bloom (simple box blur on bright areas), scanlines, color adjustments, vignette
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dstIdx = (y * width + x) * 4;

        let r = tempData[dstIdx];
        let g = tempData[dstIdx + 1];
        let b = tempData[dstIdx + 2];

        // Simple bloom: add blurred bright pixels
        if (bloomIntensity > 0) {
          let bloomR = 0, bloomG = 0, bloomB = 0;
          let samples = 0;

          for (let dy = -bloomRadius; dy <= bloomRadius; dy++) {
            for (let dx = -bloomRadius; dx <= bloomRadius; dx++) {
              const sx = x + dx;
              const sy = y + dy;
              if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                const sIdx = (sy * width + sx) * 4;
                const sr = tempData[sIdx];
                const sg = tempData[sIdx + 1];
                const sb = tempData[sIdx + 2];
                // Only bloom bright pixels
                const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
                if (lum > 128) {
                  bloomR += sr;
                  bloomG += sg;
                  bloomB += sb;
                  samples++;
                }
              }
            }
          }

          if (samples > 0) {
            bloomR /= samples;
            bloomG /= samples;
            bloomB /= samples;
            r = r + bloomR * bloomIntensity;
            g = g + bloomG * bloomIntensity;
            b = b + bloomB * bloomIntensity;
          }
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
