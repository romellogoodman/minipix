import { randomNumber, randFloat } from "../utils.js";
import { RISO_INKS } from "./risoInks.js";

// White is a no-op under multiply; Black annihilates all other layers.
const PRINTABLE_INKS = RISO_INKS.filter((ink) => ink.name !== "White" && ink.name !== "Black");

export default function risograph({ imageData, width, height, config, random, outputData }) {
  const numLayers = randomNumber(config.numLayers.min, config.numLayers.max, random);
  const grain = randFloat(config.grain, random);
  const maxOffset = Math.round(Math.min(width, height) * randFloat(config.misregistration, random));

  // Pick distinct inks and per-layer misregistration offsets + threshold bands
  const inks = [];
  const used = new Set();
  for (let i = 0; i < numLayers; i++) {
    let pick;
    do { pick = Math.floor(random() * PRINTABLE_INKS.length); } while (used.has(pick));
    used.add(pick);
    inks.push({
      color: PRINTABLE_INKS[pick].rgb,
      dx: Math.round((random() - 0.5) * 2 * maxOffset),
      dy: Math.round((random() - 0.5) * 2 * maxOffset),
      // Each layer prints where source luminance falls below its threshold.
      // Top layer threshold=1 so highlights receive at least one ink.
      threshold: (i + 1) / numLayers,
    });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 255, g = 255, b = 255;

      for (const ink of inks) {
        const sx = Math.max(0, Math.min(width - 1, x - ink.dx));
        const sy = Math.max(0, Math.min(height - 1, y - ink.dy));
        const si = (sy * width + sx) * 4;
        const lum = (0.299 * imageData[si] + 0.587 * imageData[si + 1] + 0.114 * imageData[si + 2]) / 255;
        const noisy = lum + (random() - 0.5) * grain;
        if (noisy < ink.threshold) {
          r = (r * ink.color[0]) / 255;
          g = (g * ink.color[1]) / 255;
          b = (b * ink.color[2]) / 255;
        }
      }

      const idx = (y * width + x) * 4;
      outputData[idx] = r;
      outputData[idx + 1] = g;
      outputData[idx + 2] = b;
      outputData[idx + 3] = 255;
    }
  }
}
