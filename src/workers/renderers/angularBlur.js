import { randFloat } from "../utils.js";

const M = 0x00ff00ff;

// Bilinear step on packed RGB words (red and blue share one multiply in
// 16-bit lanes) with an 8-bit weight f (0-256) and rounding. Alpha is
// dropped so results stay small integers (no boxing in V8).
const lerp = (p, q, f) => {
  const g = 256 - f;
  const rb = (((p & M) * g + (q & M) * f + 0x00800080) >>> 8) & M;
  const gg = (((p >>> 8) & 0xff) * g + ((q >>> 8) & 0xff) * f + 0x80) & 0xff00;
  return rb | gg;
};

/**
 * Rotational blur around a random centre (after AngularBlur's orbit path).
 * Instead of tapping along an arc per pixel, the image is resampled into a
 * polar grid (one row per pixel of radius), each row is Gaussian-blurred
 * along the angle axis with three wrapping box passes, and the grid is mapped
 * back. Arc length grows with radius, so the centre stays crisp and the
 * corners swirl. The grid holds packed RGBA words throughout: resampling,
 * box sums and read-back work on red and blue together in 16-bit lanes.
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
  const cosT = new Float64Array(nA);
  const sinT = new Float64Array(nA);
  for (let a = 0; a < nA; a++) {
    cosT[a] = Math.cos(a / binsPerRad);
    sinT[a] = Math.sin(a / binsPerRad);
  }

  const src =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
      : new Uint32Array(imageData.slice().buffer);

  // Forward: bilinear-sample the source into the polar grid (row = radius).
  const polar = new Uint32Array(nR * nA);
  forwardSample(polar, src, width, height, cx, cy, nA, nR, cosT, sinT);

  // Blur each ring along the angle axis. Sigma is a quarter of the sweep;
  // three box passes of width ~sqrt(4σ² + 1) approximate the Gaussian. A
  // window of up to 257 bytes per lane fits the 16-bit lanes, hence the cap.
  const sigma = (sweep / 4) * binsPerRad;
  const boxR = Math.min(128, nA >> 1, Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2)));
  blurRings(polar, nA, nR, boxR);

  // Backward: bilinear lookup in the polar grid (angle wraps). atan2 is a
  // minimax polynomial (error ~1e-5 rad, a tiny fraction of one angle bin).
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  backMap(out32, polar, width, height, cx, cy, nA, nR, binsPerRad);
}

// The hot loops live in their own functions so V8 optimizes each with
// stable types (inline in the main body they ran up to 2x slower).
function backMap(out32, polar, width, height, cx, cy, nA, nR, binsPerRad) {
  const HALF_PI = Math.PI / 2;
  for (let y = 0, o = 0; y < height; y++) {
    const dy = y - cy;
    const ady = dy < 0 ? -dy : dy;
    const dy2 = dy * dy;
    for (let x = 0; x < width; x++, o++) {
      const dx = x - cx;
      const adx = dx < 0 ? -dx : dx;
      const rr = Math.sqrt(dx * dx + dy2);
      let t;
      if (adx >= ady) {
        const q = adx > 0 ? ady / adx : 0, s = q * q;
        t = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * q + q;
      } else {
        const q = adx / ady, s = q * q;
        t = HALF_PI - (((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * q + q);
      }
      if (dx < 0) t = Math.PI - t;
      if (dy < 0) t = -t;
      let aa = t * binsPerRad;
      if (aa < 0) aa += nA;
      let a0 = aa | 0;
      const fa = ((aa - a0) * 256) | 0;
      if (a0 >= nA) a0 -= nA;
      const a1 = a0 + 1 < nA ? a0 + 1 : 0;
      const r0 = rr | 0;
      const fr = ((rr - r0) * 256) | 0;
      const i0 = r0 * nA;
      const i1 = r0 + 1 < nR ? i0 + nA : i0;
      out32[o] = lerp(lerp(polar[i0 + a0], polar[i0 + a1], fa), lerp(polar[i1 + a0], polar[i1 + a1], fa), fr) | 0xff000000;
    }
  }
}

function forwardSample(polar, src, width, height, cx, cy, nA, nR, cosT, sinT) {
  const maxX = width - 1;
  const maxY = height - 1;
  for (let r = 0, p = 0; r < nR; r++) {
    for (let a = 0; a < nA; a++, p++) {
      const x = cx + r * cosT[a];
      const y = cy + r * sinT[a];
      if (x < 0 || x > maxX || y < 0 || y > maxY) {
        // Off the image (only blur context for the edge): nearest edge pixel.
        const ex = x < 0 ? 0 : x > maxX ? maxX : x | 0;
        const ey = y < 0 ? 0 : y > maxY ? maxY : y | 0;
        polar[p] = src[ey * width + ex] & 0xffffff;
        continue;
      }
      const x0 = x | 0, y0 = y | 0;
      const fx = ((x - x0) * 256) | 0, fy = ((y - y0) * 256) | 0;
      const i00 = y0 * width + x0;
      const i01 = y0 < maxY ? i00 + width : i00;
      const dx = x0 < maxX ? 1 : 0;
      polar[p] = lerp(lerp(src[i00], src[i00 + dx], fx), lerp(src[i01], src[i01 + dx], fx), fy);
    }
  }
}

// Three wrapping box passes per ring. Each pass copies the ring into a buffer
// padded with its own wrap-around, so the running sums need no index wrapping.
function blurRings(polar, nA, nR, boxR) {
  const win = boxR * 2 + 1;
  const inv = 1 / win;
  const ext = new Uint32Array(nA + win);
  for (let r = 0; r < nR; r++) {
    const ring = polar.subarray(r * nA, r * nA + nA);
    for (let pass = 0; pass < 3; pass++) {
      ext.set(ring.subarray(nA - boxR), 0);
      ext.set(ring, boxR);
      ext.set(ring.subarray(0, boxR + 1), boxR + nA);
      let sRB = 0, sG = 0;
      for (let j = 0; j < win; j++) {
        sRB += ext[j] & M;
        sG += (ext[j] >>> 8) & 0xff;
      }
      for (let a = 0, si = 0, ai = win; a < nA; a++, si++, ai++) {
        const cr = ((sRB & 0xffff) * inv + 0.5) | 0;
        const cb = ((sRB >>> 16) * inv + 0.5) | 0;
        const cg = (sG * inv + 0.5) | 0;
        ring[a] = cr | (cg << 8) | (cb << 16);
        const ad = ext[ai], sb = ext[si];
        sRB += (ad & M) - (sb & M);
        sG += ((ad >>> 8) & 0xff) - ((sb >>> 8) & 0xff);
      }
    }
  }
}
