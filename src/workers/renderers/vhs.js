import { randomNumber, map } from "../utils.js";

export default function vhs({ imageData, width, height, config, random, outputData }) {

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
}
