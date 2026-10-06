import { randFloat } from "../utils.js";

/**
 * Rotational blur around a random centre (after AngularBlur's orbit path).
 * Instead of tapping along an arc per pixel, the image is resampled into a
 * polar grid (one row per pixel of radius), each row is Gaussian-blurred
 * along the angle axis with three wrapping box passes, and the grid is mapped
 * back. Arc length grows with radius, so the centre stays crisp and the
 * corners swirl.
 */
export default function angularBlur({ imageData, width, height, config, random, outputData }) {
  const sweep = (randFloat(config.sweepDegrees, random) * Math.PI) / 180;
  const cx = randFloat(config.center, random) * width;
  const cy = randFloat(config.center, random) * height;

  const maxR = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );
  const nR = Math.ceil(maxR) + 2;
  // Enough angle bins that the blur spans ~48 of them, within memory limits.
  const nA = Math.min(4096, Math.max(1024, Math.ceil((Math.PI * 2 * 48) / sweep)));
  const binsPerRad = nA / (Math.PI * 2);
  const cosT = new Float32Array(nA);
  const sinT = new Float32Array(nA);
  for (let a = 0; a < nA; a++) {
    cosT[a] = Math.cos(a / binsPerRad);
    sinT[a] = Math.sin(a / binsPerRad);
  }

  // Forward: bilinear-sample the source into the polar grid (RGB, row = radius).
  const polar = new Uint8ClampedArray(nR * nA * 3);
  const maxX = width - 1;
  const maxY = height - 1;
  for (let r = 0, p = 0; r < nR; r++) {
    for (let a = 0; a < nA; a++, p += 3) {
      let x = cx + r * cosT[a];
      let y = cy + r * sinT[a];
      x = x < 0 ? 0 : x > maxX ? maxX : x;
      y = y < 0 ? 0 : y > maxY ? maxY : y;
      const x0 = x | 0, y0 = y | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * width + x0) * 4, i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = imageData[i00 + c] + (imageData[i10 + c] - imageData[i00 + c]) * fx;
        const bot = imageData[i01 + c] + (imageData[i11 + c] - imageData[i01 + c]) * fx;
        polar[p + c] = top + (bot - top) * fy;
      }
    }
  }

  // Blur each ring along the angle axis. Sigma is a quarter of the sweep;
  // three box passes of width ~sqrt(4σ² + 1) approximate the Gaussian.
  const sigma = (sweep / 4) * binsPerRad;
  const boxR = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const span = boxR * 2 + 1;
  const inv = 1 / span;
  const row = new Float32Array(nA * 3);
  for (let r = 0; r < nR; r++) {
    const base = r * nA * 3;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nA * 3; i++) row[i] = polar[base + i];
      // Running sums around the ring (indices wrap).
      let sr = 0, sg = 0, sb = 0;
      for (let k = -boxR; k <= boxR; k++) {
        const j = (((k % nA) + nA) % nA) * 3;
        sr += row[j]; sg += row[j + 1]; sb += row[j + 2];
      }
      let add = (boxR + 1) % nA;
      let sub = ((-boxR % nA) + nA) % nA;
      for (let a = 0, o = base; a < nA; a++, o += 3) {
        polar[o] = sr * inv;
        polar[o + 1] = sg * inv;
        polar[o + 2] = sb * inv;
        const ai = add * 3, si = sub * 3;
        sr += row[ai] - row[si];
        sg += row[ai + 1] - row[si + 1];
        sb += row[ai + 2] - row[si + 2];
        if (++add === nA) add = 0;
        if (++sub === nA) sub = 0;
      }
    }
  }

  // Backward: bilinear lookup in the polar grid (angle wraps).
  for (let y = 0, o = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++, o += 4) {
      const dx = x - cx;
      const rr = Math.sqrt(dx * dx + dy * dy);
      let aa = Math.atan2(dy, dx) * binsPerRad;
      if (aa < 0) aa += nA;
      const r0 = rr | 0;
      const a0 = (aa | 0) % nA;
      const a1 = (a0 + 1) % nA;
      const fr = rr - r0, fa = aa - (aa | 0);
      const r1 = r0 + 1 < nR ? r0 + 1 : r0;
      const p00 = (r0 * nA + a0) * 3, p01 = (r0 * nA + a1) * 3;
      const p10 = (r1 * nA + a0) * 3, p11 = (r1 * nA + a1) * 3;
      for (let c = 0; c < 3; c++) {
        const inner = polar[p00 + c] + (polar[p01 + c] - polar[p00 + c]) * fa;
        const outer = polar[p10 + c] + (polar[p11 + c] - polar[p10 + c]) * fa;
        outputData[o + c] = inner + (outer - inner) * fr;
      }
      outputData[o + 3] = 255;
    }
  }
}
