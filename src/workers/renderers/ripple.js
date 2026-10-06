import { randInt, randFloat, catmullRomWeights } from "../utils.js";

const STEPS = 8; // table samples per pixel of distance

export default function ripple({ imageData, width, height, config, random, outputData }) {
  const numRipples = randInt(config.numRipples, random);
  const minDimension = Math.min(width, height);
  const amplitudePercent =
    numRipples === 1 ? config.singleRippleAmplitudePercent : randFloat(config.amplitudePercent, random);
  const amplitude = minDimension * amplitudePercent;
  // Frequency expressed per-pixel-of-min-dimension so ring density is
  // resolution-independent.
  const frequency = randFloat(config.frequency, random) / minDimension * 1000;

  const ripples = [];
  for (let i = 0; i < numRipples; i++) {
    ripples.push({
      x: random() * width,
      y: random() * height,
      phase: random() * Math.PI * 2,
    });
  }

  // Center the group on the canvas, but leave a single ripple where it fell.
  if (numRipples > 1) {
    const cx = ripples.reduce((s, r) => s + r.x, 0) / numRipples;
    const cy = ripples.reduce((s, r) => s + r.y, 0) / numRipples;
    for (const r of ripples) { r.x += width / 2 - cx; r.y += height / 2 - cy; }
  }

  // Smooth falloff instead of a hard influence-radius cutoff.
  const falloffScale = 3 / (amplitude / frequency + amplitude);
  // Beyond this distance decay < 0.01 and the ripple contributes nothing.
  const cutoff = Math.log(100) / falloffScale;
  const cutoffSq = cutoff * cutoff;

  // Each ripple's push is (dx, dy) · g(dist) with
  // g = sin(dist·freq + phase) · amplitude · decay / dist. Tabulate g over
  // distance (1/STEPS px apart, linearly interpolated) instead of evaluating
  // sin/exp per pixel per ripple.
  const n = Math.ceil(cutoff * STEPS) + 2;
  const tables = ripples.map((r) => {
    const g = new Float64Array(n);
    for (let k = 1; k < n; k++) {
      const dist = k / STEPS;
      const decay = Math.exp(-dist * falloffScale);
      g[k] = decay < 0.01 ? 0 : (Math.sin(dist * frequency + r.phase) * amplitude * decay) / dist;
    }
    // dist → 0: the push direction is undefined; the original skipped it.
    g[0] = g[1];
    return g;
  });
  const rx = Float64Array.from(ripples, (r) => r.x);
  const ry = Float64Array.from(ripples, (r) => r.y);

  const maxX = width - 1, maxY = height - 1;
  // One little-endian RGBA word per pixel.
  const src32 = imageData.byteOffset % 4 === 0
    ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
    : new Uint32Array(imageData.slice().buffer, 0, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  // Exact displacement at (x, y), written to off[0..1].
  const off = new Float64Array(2);
  const offsetAt = (x, y) => {
    let offsetX = 0, offsetY = 0;
    for (let i = 0; i < numRipples; i++) {
      const dx = x - rx[i];
      const dy = y - ry[i];
      const distSq = dx * dx + dy * dy;
      if (distSq >= cutoffSq || distSq === 0) continue;
      const t = Math.sqrt(distSq) * STEPS;
      const k = t | 0;
      const g = tables[i];
      const w = g[k] + (g[k + 1] - g[k]) * (t - k);
      offsetX += dx * w;
      offsetY += dy * w;
    }
    off[0] = offsetX;
    off[1] = offsetY;
  };
  const write = (x, y, offsetX, offsetY) => {
    let srcX = Math.round(x + offsetX);
    let srcY = Math.round(y + offsetY);
    srcX = srcX < 0 ? 0 : srcX > maxX ? maxX : srcX;
    srcY = srcY < 0 ? 0 : srcY > maxY ? maxY : srcY;
    out32[y * width + x] = src32[srcY * width + srcX] | 0xff000000;
  };

  // The field is smooth away from the ripple centres (rings are dozens of px
  // apart), so evaluate it every GRID px and Catmull-Rom interpolate between:
  // grid rows are upsampled along x as needed, then each output row blends four.
  const period = (Math.PI * 2) / frequency;
  const GRID = Math.max(1, Math.min(4, Math.floor(period / 8)));
  const gw = Math.floor((width - 1) / GRID) + 4; // node i at x = (i - 1) * GRID
  const wx = new Float64Array(GRID * 4);
  for (let r = 0; r < GRID; r++) catmullRomWeights(r / GRID, wx, r * 4);
  const ringX = [0, 1, 2, 3].map(() => new Float32Array(width));
  const ringY = [0, 1, 2, 3].map(() => new Float32Array(width));
  const ringRow = new Int32Array(4).fill(-1);
  const nodeX = new Float64Array(gw);
  const nodeY = new Float64Array(gw);
  const upsampleRow = (j) => {
    const slot = j & 3;
    if (ringRow[slot] === j) return;
    ringRow[slot] = j;
    const y = (j - 1) * GRID;
    for (let i = 0; i < gw; i++) {
      offsetAt((i - 1) * GRID, y);
      nodeX[i] = off[0];
      nodeY[i] = off[1];
    }
    const outX = ringX[slot], outY = ringY[slot];
    for (let x = 0; x < width; x++) {
      const i = (x / GRID) | 0; // nodes i .. i + 3 surround x
      const w = (x - i * GRID) * 4;
      const w0 = wx[w], w1 = wx[w + 1], w2 = wx[w + 2], w3 = wx[w + 3];
      outX[x] = nodeX[i] * w0 + nodeX[i + 1] * w1 + nodeX[i + 2] * w2 + nodeX[i + 3] * w3;
      outY[x] = nodeY[i] * w0 + nodeY[i + 1] * w1 + nodeY[i + 2] * w2 + nodeY[i + 3] * w3;
    }
  };
  const wy = new Float64Array(4);
  for (let y = 0; y < height; y++) {
    const j = (y / GRID) | 0;
    for (let k = 0; k < 4; k++) upsampleRow(j + k);
    catmullRomWeights((y - j * GRID) / GRID, wy, 0);
    const w0 = wy[0], w1 = wy[1], w2 = wy[2], w3 = wy[3];
    const ax = ringX[j & 3], bx = ringX[(j + 1) & 3], cx = ringX[(j + 2) & 3], ex = ringX[(j + 3) & 3];
    const ay = ringY[j & 3], by = ringY[(j + 1) & 3], cy = ringY[(j + 2) & 3], ey = ringY[(j + 3) & 3];
    const row = y * width;
    for (let x = 0; x < width; x++) {
      // Same as Math.round: floor(v + 0.5) (truncation is floor once clamped ≥ 0).
      let fx = x + 0.5 + ax[x] * w0 + bx[x] * w1 + cx[x] * w2 + ex[x] * w3;
      let fy = y + 0.5 + ay[x] * w0 + by[x] * w1 + cy[x] * w2 + ey[x] * w3;
      fx = fx < 0 ? 0 : fx > maxX ? maxX : fx;
      fy = fy < 0 ? 0 : fy > maxY ? maxY : fy;
      const srcX = fx | 0, srcY = fy | 0;
      out32[row + x] = src32[srcY * width + srcX] | 0xff000000;
    }
  }

  // Each centre is a pinch point (the push direction flips across it), which
  // interpolation would smear: redo the pixels around it exactly.
  const R = 3 * GRID;
  for (let i = 0; i < numRipples; i++) {
    const x0 = Math.max(0, Math.floor(rx[i]) - R), x1 = Math.min(maxX, Math.ceil(rx[i]) + R);
    const y0 = Math.max(0, Math.floor(ry[i]) - R), y1 = Math.min(maxY, Math.ceil(ry[i]) + R);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        offsetAt(x, y);
        write(x, y, off[0], off[1]);
      }
    }
  }
}
