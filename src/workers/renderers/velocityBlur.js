import {
  randFloat,
  randInt,
  fitSize,
  downsampleImage,
  computeSaliency,
  findBlobs,
} from "../utils.js";

const FIELD_MAX = 256;
const MODES = ["pan", "rotate", "bands", "blobs"];

/**
 * Motion blur driven by a synthetic velocity map. A per-region velocity
 * field is built at low resolution — a global pan, a rotation about a
 * pivot, sliding bands, or a handful of "moving objects" found by the blob
 * tracker — and every pixel is blurred along its local velocity. Samples are
 * weighted by a raised-cosine shutter so streaks have soft heads and tails,
 * and regions with zero velocity stay perfectly sharp.
 */
export default function velocityBlur({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const numSamples = randInt(config.numSamples, random);
  const speed = shortSide * randFloat(config.speedPercent, random);
  const mode = MODES[Math.floor(random() * MODES.length)];

  const { w: fw, h: fh } = fitSize(width, height, FIELD_MAX);
  const vx = new Float32Array(fw * fh);
  const vy = new Float32Array(fw * fh);
  // Velocities are stored in full-resolution pixels; field cells map to
  // image space through these scales.
  const cellW = width / fw;
  const cellH = height / fh;

  switch (mode) {
    case "pan": {
      const angle = random() * Math.PI * 2;
      vx.fill(Math.cos(angle) * speed);
      vy.fill(Math.sin(angle) * speed);
      break;
    }
    case "rotate": {
      const px = (0.2 + random() * 0.6) * width;
      const py = (0.2 + random() * 0.6) * height;
      const sign = random() < 0.5 ? -1 : 1;
      // Angular speed so the farthest corner moves at ~2x speed.
      const cornerDist = Math.max(
        Math.hypot(px, py),
        Math.hypot(width - px, py),
        Math.hypot(px, height - py),
        Math.hypot(width - px, height - py)
      );
      const omega = (sign * speed * 2) / Math.max(1, cornerDist);
      for (let y = 0, i = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++, i++) {
          const dx = (x + 0.5) * cellW - px;
          const dy = (y + 0.5) * cellH - py;
          vx[i] = -dy * omega;
          vy[i] = dx * omega;
        }
      }
      break;
    }
    case "bands": {
      const horizontal = random() < 0.5;
      const numBands = randInt(config.numBands, random);
      const bandSpeeds = new Float32Array(numBands);
      for (let b = 0; b < numBands; b++) {
        const moving = random() < 0.7;
        const magnitude = speed * (0.3 + 0.7 * random());
        const sign = random() < 0.5 ? -1 : 1;
        bandSpeeds[b] = moving ? magnitude * sign : 0;
      }
      for (let y = 0, i = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++, i++) {
          const along = horizontal ? y / fh : x / fw;
          const s = bandSpeeds[Math.min(numBands - 1, Math.floor(along * numBands))];
          if (horizontal) vx[i] = s;
          else vy[i] = s;
        }
      }
      break;
    }
    case "blobs":
    default: {
      const numBlobs = randInt(config.numBlobs, random);
      const ds = downsampleImage(imageData, width, height, FIELD_MAX);
      const saliency = computeSaliency(ds, "edges");
      const blobs = findBlobs(saliency, ds.w, ds.h, numBlobs, random, { iterations: 6 });
      for (const blob of blobs) {
        const angle = random() * Math.PI * 2;
        // "Objects" move faster than the scene-wide speed so they read as
        // the thing that moved.
        const magnitude = speed * (1 + random());
        if (blob.mass <= 0) continue;
        const bvx = Math.cos(angle) * magnitude;
        const bvy = Math.sin(angle) * magnitude;
        const cx = blob.x * fw;
        const cy = blob.y * fh;
        // Gaussian footprint: wider than the blob's spread, and never so
        // small that the moving "object" is invisible at grid size.
        const sx = Math.max(fw * 0.05, blob.sx * fw * 2.5);
        const sy = Math.max(fh * 0.05, blob.sy * fh * 2.5);
        const inv2sx = 1 / (2 * sx * sx);
        const inv2sy = 1 / (2 * sy * sy);
        for (let y = 0, i = 0; y < fh; y++) {
          const dy = y + 0.5 - cy;
          for (let x = 0; x < fw; x++, i++) {
            const dx = x + 0.5 - cx;
            // Super-Gaussian: flat-topped so the whole object moves together,
            // with a quick falloff at its boundary.
            const r2 = dx * dx * inv2sx + dy * dy * inv2sy;
            const g = Math.exp(-r2 * r2);
            if (g < 0.01) continue;
            vx[i] += bvx * g;
            vy[i] += bvy * g;
          }
        }
      }
      break;
    }
  }

  // Raised-cosine shutter weights along the velocity, applied as two
  // passes: `a` evenly weighted taps a short step apart, then `b` taps a
  // long step apart carrying the shutter weights. Together they place the
  // same a*b evenly spaced samples as one long gather (with a stepped
  // shutter curve) at a fraction of the reads. a*b is the smallest product
  // >= numSamples for the cheapest a + b.
  let fa = 1, fb = numSamples;
  for (let a = 2; a <= numSamples; a++) {
    const b = Math.ceil(numSamples / a);
    if (a + b < fa + fb || (a + b === fa + fb && a * b < fa * fb)) {
      fa = a;
      fb = b;
    }
  }
  const total = fa * fb;
  const innerOffsets = new Float32Array(fa);
  const innerWeights = new Float32Array(fa).fill(1 / fa);
  for (let j = 0; j < fa; j++) innerOffsets[j] = (j - (fa - 1) / 2) / total;
  const outerOffsets = new Float32Array(fb);
  const outerWeights = new Float32Array(fb);
  let weightSum = 0;
  for (let i = 0; i < fb; i++) {
    outerOffsets[i] = ((i - (fb - 1) / 2) * fa) / total;
    for (let j = 0; j < fa; j++) {
      const t = (i * fa + j + 0.5) / total;
      outerWeights[i] += 0.5 * (1 - Math.cos(2 * Math.PI * t));
    }
    weightSum += outerWeights[i];
  }
  for (let i = 0; i < fb; i++) outerWeights[i] /= weightSum;

  const n = width * height;
  const src32 =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, n)
      : new Uint32Array(imageData.slice().buffer, 0, n);
  const outAligned = outputData.byteOffset % 4 === 0;
  const out32 = outAligned
    ? new Uint32Array(outputData.buffer, outputData.byteOffset, n)
    : new Uint32Array(n);
  const mid32 = new Uint32Array(n);
  const field = { vx, vy, fw, fh, width, height };
  gatherPass(src32, mid32, field, innerOffsets, innerWeights);
  gatherPass(mid32, out32, field, outerOffsets, outerWeights);
  if (!outAligned) outputData.set(new Uint8ClampedArray(out32.buffer));
}

/**
 * One gather along each pixel's cell velocity: dst = sum of w[s] * src at
 * (x, y) + floor(v * offsets[s]), clamped at the edges. Pixels in cells
 * slower than half a pixel are copied.
 */
function gatherPass(src32, dst32, { vx, vy, fw, fh, width, height }, offsets, weights) {
  const numSamples = offsets.length;
  const fsx = fw / width;
  const fsy = fh / height;
  const maxX = width - 1;
  const maxY = height - 1;

  // Within a field cell the velocity is constant, so (for integer x, y)
  // every tap lands at a fixed integer offset from the pixel. Build each
  // cell's tap list once, merging taps that land on the same pixel, plus
  // its offset bounds so interior pixels can skip the clamping. Weights are
  // quantized to integers summing to 256 so the taps can be accumulated two
  // channels per 32-bit word (R and B in 16-bit lanes, G alone).
  const numCells = fw * fh;
  const tapCount = new Int32Array(numCells); // 0 = still cell (copy)
  const tapDx = new Int32Array(numCells * numSamples);
  const tapDy = new Int32Array(numCells * numSamples);
  const tapW = new Int32Array(numCells * numSamples);
  const bounds = new Int32Array(numCells * 4);
  const mergedW = new Float64Array(numSamples);
  for (let c = 0; c < numCells; c++) {
    const pvx = vx[c];
    const pvy = vy[c];
    if (pvx * pvx + pvy * pvy < 0.25) continue;
    const base = c * numSamples;
    let count = 0;
    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    for (let s = 0; s < numSamples; s++) {
      const dx = Math.floor(pvx * offsets[s]);
      const dy = Math.floor(pvy * offsets[s]);
      let k = 0;
      while (k < count && (tapDx[base + k] !== dx || tapDy[base + k] !== dy)) k++;
      if (k < count) {
        mergedW[k] += weights[s];
        continue;
      }
      tapDx[base + k] = dx;
      tapDy[base + k] = dy;
      mergedW[k] = weights[s];
      count++;
      if (dx < minDx) minDx = dx;
      if (dx > maxDx) maxDx = dx;
      if (dy < minDy) minDy = dy;
      if (dy > maxDy) maxDy = dy;
    }
    let total = 0, biggest = 0;
    for (let k = 0; k < count; k++) {
      const q = Math.round(mergedW[k] * 256);
      tapW[base + k] = q;
      total += q;
      if (q > tapW[base + biggest]) biggest = k;
    }
    tapW[base + biggest] += 256 - total;
    tapCount[c] = count;
    bounds[c * 4] = minDx;
    bounds[c * 4 + 1] = maxDx;
    bounds[c * 4 + 2] = minDy;
    bounds[c * 4 + 3] = maxDy;
  }

  // Column spans of each field cell.
  const colStart = new Int32Array(fw + 1);
  for (let x = 0, cx = 0; x < width; x++) {
    const c = (x * fsx) | 0;
    while (cx <= c) colStart[cx++] = x;
  }
  colStart[fw] = width;
  for (let cx = fw - 1; cx >= 0; cx--) if (colStart[cx] > colStart[cx + 1]) colStart[cx] = colStart[cx + 1];

  const tapOff = new Int32Array(numSamples);
  const tapWk = new Int32Array(numSamples);
  for (let y = 0; y < height; y++) {
    const fy = ((y * fsy) | 0) * fw;
    const rowStart = y * width;
    for (let cx = 0; cx < fw; cx++) {
      const xs = colStart[cx];
      const xe = colStart[cx + 1];
      if (xs >= xe) continue;
      const c = fy + cx;
      const count = tapCount[c];
      if (count === 0) {
        for (let pi = rowStart + xs, pe = rowStart + xe; pi < pe; pi++) dst32[pi] = src32[pi] | 0xff000000;
        continue;
      }
      const base = c * numSamples;
      const b4 = c * 4;
      const minDx = bounds[b4], maxDx = bounds[b4 + 1];
      const yInside = y + bounds[b4 + 2] >= 0 && y + bounds[b4 + 3] <= maxY;
      // Interior x range [ix0, ix1) where no tap needs clamping.
      let ix0 = xs, ix1 = xe;
      if (!yInside) ix0 = ix1 = xs;
      else {
        if (ix0 < -minDx) ix0 = -minDx;
        if (ix1 > width - maxDx) ix1 = width - maxDx;
        if (ix1 < ix0) ix1 = ix0;
        if (ix0 > xe) ix0 = ix1 = xe;
      }
      for (let k = 0; k < count; k++) {
        tapOff[k] = tapDy[base + k] * width + tapDx[base + k];
        tapWk[k] = tapW[base + k];
      }
      for (let x = xs; x < xe; x++) {
        const pi = rowStart + x;
        // Lanes start at +128 so the >> 8 below rounds.
        let rb = 0x00800080, g = 0x8000;
        if (x >= ix0 && x < ix1) {
          for (let k = 0; k < count; k++) {
            const v = src32[pi + tapOff[k]];
            const wgt = tapWk[k];
            rb += (v & 0xff00ff) * wgt;
            g += (v & 0xff00) * wgt;
          }
        } else {
          for (let k = 0; k < count; k++) {
            let sx = x + tapDx[base + k];
            let sy = y + tapDy[base + k];
            sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
            sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
            const v = src32[sy * width + sx];
            const wgt = tapWk[k];
            rb += (v & 0xff00ff) * wgt;
            g += (v & 0xff00) * wgt;
          }
        }
        dst32[pi] = ((rb >>> 8) & 0xff00ff) | ((g >>> 8) & 0xff00) | 0xff000000;
      }
    }
  }
}
