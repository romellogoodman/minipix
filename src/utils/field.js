/**
 * Low-resolution image analysis shared by the "motion"-inspired renderers
 * (arrowField, velocityBlur).
 *
 * Everything works on plain typed arrays so it runs on the main thread, in
 * Web Workers, and in the Node CLI. Analysis happens on a downsampled copy of
 * the image: the fields we care about (edge orientation, saliency, blob
 * positions) are smooth, so a few hundred pixels across is plenty and keeps
 * the cost negligible next to the full-resolution pixel loops.
 */

/**
 * Size that fits inside maxSize on its longer side while keeping aspect ratio.
 * @returns {{w: number, h: number}}
 */
export function fitSize(width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Block-average an RGBA buffer down to at most maxSize on its longer side.
 * @param {Uint8ClampedArray} imageData - RGBA source pixels
 * @returns {{r: Float32Array, g: Float32Array, b: Float32Array, lum: Float32Array, w: number, h: number}}
 *   Planes in 0..255.
 */
export function downsampleImage(imageData, width, height, maxSize) {
  const { w, h } = fitSize(width, height, maxSize);
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const count = new Float32Array(n);

  // Column lookup so the inner loop is a single indexed read.
  const colOf = new Int32Array(width);
  for (let x = 0; x < width; x++) colOf[x] = Math.min(w - 1, Math.floor((x * w) / width));

  for (let y = 0; y < height; y++) {
    const rowBase = Math.min(h - 1, Math.floor((y * h) / height)) * w;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const c = rowBase + colOf[x];
      r[c] += imageData[i];
      g[c] += imageData[i + 1];
      b[c] += imageData[i + 2];
      count[c]++;
    }
  }

  const lum = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    const inv = count[c] > 0 ? 1 / count[c] : 0;
    r[c] *= inv;
    g[c] *= inv;
    b[c] *= inv;
    lum[c] = 0.299 * r[c] + 0.587 * g[c] + 0.114 * b[c];
  }

  return { r, g, b, lum, w, h };
}

/**
 * Separable box blur of a float plane with clamped edges. Returns a new array.
 */
export function boxBlurPlane(src, w, h, radius) {
  if (radius <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (radius * 2 + 1);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
        sum += src[row + sx];
      }
      tmp[row + x] = sum * inv;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
        sum += tmp[sy * w + x];
      }
      out[y * w + x] = sum * inv;
    }
  }
  return out;
}

/**
 * Sobel gradient of a luminance plane with clamped edges.
 * @returns {{gx: Float32Array, gy: Float32Array}}
 */
export function sobel(lum, w, h) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yp = y > 0 ? y - 1 : 0;
    const yn = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const xp = x > 0 ? x - 1 : 0;
      const xn = x < w - 1 ? x + 1 : w - 1;
      const tl = lum[yp * w + xp], t = lum[yp * w + x], tr = lum[yp * w + xn];
      const l = lum[y * w + xp], r = lum[y * w + xn];
      const bl = lum[yn * w + xp], b = lum[yn * w + x], br = lum[yn * w + xn];
      const i = y * w + x;
      gx[i] = -tl - 2 * l - bl + tr + 2 * r + br;
      gy[i] = -tl - 2 * t - tr + bl + 2 * b + br;
    }
  }
  return { gx, gy };
}

/**
 * Structure-tensor orientation field — the static-image stand-in for optical
 * flow. Sobel gradients are squared into a tensor, blurred so orientation is
 * coherent across a neighbourhood, and decomposed into:
 *
 *  - (nx, ny): unit gradient direction, signed toward the brighter side
 *  - (tx, ty): unit tangent along edges (gradient rotated +90°)
 *  - coherence: 0 (isotropic / flat) .. 1 (a single clean edge direction)
 *  - strength: edge energy normalized to the image's 98th percentile, 0..1
 *
 * @param {Float32Array} lum - luminance plane in 0..255
 * @param {number} smoothing - box-blur radius applied to the tensor, in cells
 */
export function computeOrientationField(lum, w, h, smoothing) {
  const n = w * h;
  const { gx, gy } = sobel(lum, w, h);

  let exx = new Float32Array(n);
  let exy = new Float32Array(n);
  let eyy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    exx[i] = gx[i] * gx[i];
    exy[i] = gx[i] * gy[i];
    eyy[i] = gy[i] * gy[i];
  }
  let mgx = gx;
  let mgy = gy;
  if (smoothing > 0) {
    exx = boxBlurPlane(exx, w, h, smoothing);
    exy = boxBlurPlane(exy, w, h, smoothing);
    eyy = boxBlurPlane(eyy, w, h, smoothing);
    mgx = boxBlurPlane(gx, w, h, smoothing);
    mgy = boxBlurPlane(gy, w, h, smoothing);
  }

  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const coherence = new Float32Array(n);
  const strength = new Float32Array(n);
  let maxStrength = 0;

  for (let i = 0; i < n; i++) {
    const a = exx[i] - eyy[i];
    const b = 2 * exy[i];
    const trace = exx[i] + eyy[i];
    const diff = Math.sqrt(a * a + b * b);
    coherence[i] = trace > 1e-6 ? diff / trace : 0;
    const theta = 0.5 * Math.atan2(b, a);
    let dx = Math.cos(theta);
    let dy = Math.sin(theta);
    // The tensor only knows orientation mod 180°; use the mean gradient to
    // pick the sign that points toward the brighter side.
    if (dx * mgx[i] + dy * mgy[i] < 0) {
      dx = -dx;
      dy = -dy;
    }
    nx[i] = dx;
    ny[i] = dy;
    tx[i] = -dy;
    ty[i] = dx;
    const s = Math.sqrt(trace);
    strength[i] = s;
    if (s > maxStrength) maxStrength = s;
  }
  // Normalize to the 98th percentile rather than the single strongest cell,
  // so one hard edge doesn't squash every other value toward zero.
  if (maxStrength > 0) {
    const BINS = 1024;
    const hist = new Uint32Array(BINS);
    for (let i = 0; i < n; i++) {
      hist[Math.min(BINS - 1, ((strength[i] / maxStrength) * BINS) | 0)]++;
    }
    let cumulative = 0;
    let bin = 0;
    for (; bin < BINS; bin++) {
      cumulative += hist[bin];
      if (cumulative >= n * 0.98) break;
    }
    const p98 = ((bin + 1) / BINS) * maxStrength;
    const inv = 1 / (p98 > 0 ? p98 : maxStrength);
    for (let i = 0; i < n; i++) strength[i] = Math.min(1, strength[i] * inv);
  }

  return { nx, ny, tx, ty, coherence, strength, w, h };
}

/**
 * A 0..1 "where should attention go" map at the downsampled resolution —
 * the static replacement for a motion mask.
 * @param {ReturnType<typeof downsampleImage>} ds
 * @param {"edges"|"bright"|"dark"|"saturation"|"detail"} mode
 */
export function computeSaliency(ds, mode) {
  const { r, g, b, lum, w, h } = ds;
  const n = w * h;
  let out;

  switch (mode) {
    case "bright":
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = (lum[i] / 255) ** 2;
      break;
    case "dark":
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = (1 - lum[i] / 255) ** 2;
      break;
    case "saturation":
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const max = Math.max(r[i], g[i], b[i]);
        const min = Math.min(r[i], g[i], b[i]);
        out[i] = max > 0 ? (max - min) / max : 0;
      }
      break;
    case "detail": {
      const blurred = boxBlurPlane(lum, w, h, Math.max(2, Math.round(Math.max(w, h) / 16)));
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = Math.abs(lum[i] - blurred[i]) / 255;
      out = boxBlurPlane(out, w, h, 1);
      break;
    }
    case "edges":
    default: {
      const { gx, gy } = sobel(lum, w, h);
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
      out = boxBlurPlane(out, w, h, 2);
      break;
    }
  }

  let max = 0;
  for (let i = 0; i < n; i++) if (out[i] > max) max = out[i];
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < n; i++) out[i] *= inv;
  }
  return out;
}

/**
 * Blob finder after Maxime Heckel's "Shading Motion" blob tracking, adapted
 * to a static weight map. Seeds `count` points by sampling the map, then
 * iteratively moves each toward the weighted centre of the cells it owns
 * (nearest-blob ownership keeps blobs from collapsing onto each other) and
 * tracks the weighted variance for size.
 *
 * Consumes exactly 3 * count `random()` calls (seeding); the refinement is
 * deterministic.
 *
 * @param {Float32Array} weights - 0..1 map, w*h
 * @param {number} count - number of blobs
 * @param {function(): number} random
 * @param {{iterations?: number, radius?: number}} [opts]
 * @returns {{x: number, y: number, sx: number, sy: number, mass: number}[]}
 *   Centres and standard deviations in normalized 0..1 image coordinates;
 *   mass normalized to the heaviest blob (0 = found nothing to lock onto).
 */
export function findBlobs(weights, w, h, count, random, opts = {}) {
  const iterations = opts.iterations ?? 8;
  const radius = opts.radius ?? Math.max(2, Math.round(Math.max(w, h) / 6));
  const n = w * h;

  // Cumulative distribution for seeding blobs where the map is strong.
  const cdf = new Float32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += weights[i];
    cdf[i] = total;
  }

  const cx = new Float32Array(count);
  const cy = new Float32Array(count);
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const mass = new Float32Array(count);

  for (let k = 0; k < count; k++) {
    const u = random();
    const jx = random();
    const jy = random();
    if (total > 0) {
      // Binary search the CDF for the cell containing u * total.
      const target = u * total;
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      cx[k] = (lo % w) + jx;
      cy[k] = Math.floor(lo / w) + jy;
    } else {
      cx[k] = u * w;
      cy[k] = jy * h;
    }
    sx[k] = radius / 2;
    sy[k] = radius / 2;
  }

  const owner = new Int16Array(n);
  const r2 = radius * radius;

  for (let it = 0; it < iterations; it++) {
    // Nearest-blob ownership map.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = 0, bestD = Infinity;
        for (let k = 0; k < count; k++) {
          const dx = x + 0.5 - cx[k], dy = y + 0.5 - cy[k];
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = k; }
        }
        owner[y * w + x] = best;
      }
    }

    for (let k = 0; k < count; k++) {
      const x0 = Math.max(0, Math.floor(cx[k] - radius));
      const x1 = Math.min(w - 1, Math.ceil(cx[k] + radius));
      const y0 = Math.max(0, Math.floor(cy[k] - radius));
      const y1 = Math.min(h - 1, Math.ceil(cy[k] + radius));
      let sw = 0, swx = 0, swy = 0, swxx = 0, swyy = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (owner[i] !== k) continue;
          const px = x + 0.5, py = y + 0.5;
          const dx = px - cx[k], dy = py - cy[k];
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const wgt = weights[i] * (1 - d2 / r2);
          if (wgt <= 0) continue;
          sw += wgt;
          swx += wgt * px;
          swy += wgt * py;
          swxx += wgt * px * px;
          swyy += wgt * py * py;
        }
      }
      if (sw > 0) {
        cx[k] = swx / sw;
        cy[k] = swy / sw;
        sx[k] = Math.sqrt(Math.max(0, swxx / sw - cx[k] * cx[k]));
        sy[k] = Math.sqrt(Math.max(0, swyy / sw - cy[k] * cy[k]));
        mass[k] = sw;
      } else {
        mass[k] = 0;
      }
    }
  }

  let maxMass = 0;
  for (let k = 0; k < count; k++) if (mass[k] > maxMass) maxMass = mass[k];
  const invMass = maxMass > 0 ? 1 / maxMass : 0;

  const blobs = [];
  for (let k = 0; k < count; k++) {
    blobs.push({
      x: cx[k] / w,
      y: cy[k] / h,
      sx: sx[k] / w,
      sy: sy[k] / h,
      mass: mass[k] * invMass,
    });
  }
  return blobs;
}
