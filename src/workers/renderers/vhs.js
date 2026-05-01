import { randFloat } from "../utils.js";

export default function vhs({ imageData, width, height, config, random, outputData }) {
  const trackingNoise = randFloat(config.trackingNoise, random);
  const colorBleed = Math.max(1, Math.round(width * randFloat(config.colorBleedPercent, random)));
  const wobble = Math.max(1, width * randFloat(config.wobblePercent, random));
  const noiseScale = 255 * randFloat(config.noiseIntensity, random);

  const trackingOffsets = new Int16Array(height);
  const numTrackingLines = Math.floor(height * trackingNoise);
  for (let i = 0; i < numTrackingLines; i++) {
    const lineY = Math.floor(random() * height);
    const offset = Math.floor((random() - 0.5) * width * 0.1);
    for (let dy = -2; dy <= 2; dy++) {
      const y = lineY + dy;
      if (y >= 0 && y < height) trackingOffsets[y] = offset;
    }
  }

  const wobblePhase = random() * 10;
  const wrap = (v) => (v < 0 ? v + width : v >= width ? v - width : v);

  for (let y = 0; y < height; y++) {
    const wobbleOffset = Math.round(Math.sin(y * 0.1 + wobblePhase) * wobble);
    const totalOffset = wobbleOffset + trackingOffsets[y];
    const rowOffset = y * width;
    const scanlineDark = (y & 1) === 0;

    for (let x = 0; x < width; x++) {
      const dstIdx = (rowOffset + x) * 4;
      const srcX = wrap(((x + totalOffset) % width + width) % width);
      const srcXR = wrap(srcX + colorBleed);
      const srcXB = wrap(srcX - colorBleed);

      let r = imageData[(rowOffset + srcXR) * 4];
      let g = imageData[(rowOffset + srcX) * 4 + 1];
      let b = imageData[(rowOffset + srcXB) * 4 + 2];

      const noise = (random() - 0.5) * noiseScale;
      r += noise; g += noise; b += noise;

      if (scanlineDark) { r *= 0.9; g *= 0.9; b *= 0.9; }

      outputData[dstIdx] = r;
      outputData[dstIdx + 1] = g;
      outputData[dstIdx + 2] = b;
      outputData[dstIdx + 3] = 255;
    }
  }
}
