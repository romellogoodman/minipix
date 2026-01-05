// Web Worker for pixel-intensive rendering operations
// This runs off the main thread to avoid blocking UI

// Utility functions (inlined since workers can't import from main bundle)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRandom(seed) {
  return mulberry32(seed);
}

function randomNumber(min, max, randomFn = Math.random) {
  return Math.floor(randomFn() * (max - min + 1)) + min;
}

function map(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

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

    // Generate ripple centers
    const ripples = [];
    for (let i = 0; i < numRipples; i++) {
      ripples.push({
        x: random() * width,
        y: random() * height,
        phase: random() * Math.PI * 2,
      });
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let offsetX = 0;
        let offsetY = 0;

        for (const ripple of ripples) {
          const dx = x - ripple.x;
          const dy = y - ripple.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 0) {
            const wave = Math.sin(dist * frequency + ripple.phase) * amplitude;
            offsetX += (dx / dist) * wave;
            offsetY += (dy / dist) * wave;
          }
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
