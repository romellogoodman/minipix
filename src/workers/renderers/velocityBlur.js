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

  // Raised-cosine shutter weights and normalized offsets along the velocity.
  const weights = new Float32Array(numSamples);
  const offsets = new Float32Array(numSamples);
  let weightSum = 0;
  for (let s = 0; s < numSamples; s++) {
    const t = (s + 0.5) / numSamples;
    weights[s] = 0.5 * (1 - Math.cos(2 * Math.PI * t));
    offsets[s] = t - 0.5;
    weightSum += weights[s];
  }
  const invWeightSum = 1 / weightSum;

  const fsx = fw / width;
  const fsy = fh / height;
  const maxX = width - 1;
  const maxY = height - 1;

  for (let y = 0; y < height; y++) {
    const fy = ((y * fsy) | 0) * fw;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const fi = fy + ((x * fsx) | 0);
      const pvx = vx[fi];
      const pvy = vy[fi];

      if (pvx * pvx + pvy * pvy < 0.25) {
        outputData[o] = imageData[o];
        outputData[o + 1] = imageData[o + 1];
        outputData[o + 2] = imageData[o + 2];
        outputData[o + 3] = 255;
        continue;
      }

      let sr = 0, sg = 0, sb = 0;
      for (let s = 0; s < numSamples; s++) {
        let sx = x + pvx * offsets[s];
        let sy = y + pvy * offsets[s];
        sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
        sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
        const p = ((sy | 0) * width + (sx | 0)) * 4;
        const wgt = weights[s];
        sr += imageData[p] * wgt;
        sg += imageData[p + 1] * wgt;
        sb += imageData[p + 2] * wgt;
      }
      outputData[o] = sr * invWeightSum;
      outputData[o + 1] = sg * invWeightSum;
      outputData[o + 2] = sb * invWeightSum;
      outputData[o + 3] = 255;
    }
  }
}
