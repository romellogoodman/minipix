import { randInt, randFloat } from "../utils.js";

// The bloom is a wide, soft box blur, so it is computed on a grid of
// BLOOM_BLOCK x BLOOM_BLOCK blocks from bright pixels sampled on every other
// row and column, and bilinearly upsampled.
const BLOOM_BLOCK = 4;

export default function crt({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const scanlineIntensity = randFloat(config.scanlineIntensity, random);
  const scanlineCount = randInt(config.scanlineCount, random);
  const brightness = randFloat(config.brightness, random);
  const contrast = randFloat(config.contrast, random);
  const saturation = randFloat(config.saturation, random);
  const bloomIntensity = randFloat(config.bloomIntensity, random);
  const bloomRadius = Math.max(1, Math.round(minDim * randFloat(config.bloomRadiusPercent, random)));
  const rgbShift = Math.max(1, Math.round(minDim * randFloat(config.rgbShiftPercent, random)));
  const vignetteStrength = randFloat(config.vignetteStrength, random);
  const curvature = randFloat(config.curvature, random);

  const n = width * height;
  const temp = new Uint32Array(n);
  const f = BLOOM_BLOCK;
  const sm = 1; // bright pixels: every other row and column
  const bw = Math.ceil(width / f), bh = Math.ceil(height / f), bn = bw * bh;
  const bloom = [new Float32Array(bn), new Float32Array(bn), new Float32Array(bn)];

  distort(imageData, width, height, curvature * 0.25, rgbShift, temp, bloom, bw, f, sm);

  // Same window width as the full-res box: (2r + 1)·f = 2·bloomRadius + 1.
  const r = Math.max(0, (2 * bloomRadius + 1) / (2 * f) - 0.5);
  blurBloom(bloom, bw, bh, f, sm, width, height, r);

  compose(temp, bloom, bw, bh, f, width, height, outputData, {
    scanK: (scanlineCount * Math.PI) / height,
    scanlineIntensity, brightness, contrast, saturation, bloomIntensity, vignetteStrength,
  });
}

// Box-average the bright pixels per block (only the sampled ones count), then
// a separable box blur at the block scale. The radius may be fractional (the
// two outermost taps get the fractional weight); sums are normalised by the
// in-bounds weight, so borders don't darken.
function blurBloom(bloom, bw, bh, f, sm, width, height, r) {
  const bn = bw * bh;
  const cell = new Float32Array(bn);
  for (let by = 0, i = 0; by < bh; by++) {
    const rows = Math.ceil(Math.min(f, height - by * f) / (sm + 1));
    for (let bx = 0; bx < bw; bx++, i++) cell[i] = 1 / (rows * Math.ceil(Math.min(f, width - bx * f) / (sm + 1)));
  }
  const R = Math.floor(r), t = r - R;
  const invX = boxNorms(bw, R, t), invY = boxNorms(bh, R, t);
  const tmp = new Float32Array(bn);
  const colAcc = new Float64Array(bw);
  for (const plane of bloom) {
    for (let i = 0; i < bn; i++) plane[i] *= cell[i];
    for (let y = 0; y < bh; y++) boxRow(plane, tmp, y * bw, bw, R, t, invX);
    boxColumns(tmp, plane, colAcc, bw, bh, R, t, invY);
  }
}

// 1 / (in-bounds weight) of the window at each position of a line.
function boxNorms(len, R, t) {
  const inv = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    let w = Math.min(len - 1, i + R) - Math.max(0, i - R) + 1;
    if (t > 0 && i - R - 1 >= 0) w += t;
    if (t > 0 && i + R + 1 < len) w += t;
    inv[i] = 1 / w;
  }
  return inv;
}

function boxRow(src, dst, o, len, R, t, inv) {
  let s = 0;
  for (let j = 0; j <= R && j < len; j++) s += src[o + j];
  for (let i = 0; i < len; i++) {
    const lo = i - R - 1, hi = i + R + 1;
    let v = s;
    if (t > 0) {
      if (lo >= 0) v += src[o + lo] * t;
      if (hi < len) v += src[o + hi] * t;
    }
    dst[o + i] = v * inv[i];
    if (hi < len) s += src[o + hi];
    if (i - R >= 0) s -= src[o + i - R];
  }
}

// boxRow down every column at once, walking rows (sequential reads).
function boxColumns(src, dst, colAcc, w, h, R, t, inv) {
  colAcc.fill(0);
  for (let j = 0; j <= R && j < h; j++) {
    for (let x = 0, o = j * w; x < w; x++) colAcc[x] += src[o + x];
  }
  for (let y = 0; y < h; y++) {
    const lo = y - R - 1, hi = y + R + 1;
    const useLo = t > 0 && lo >= 0, useHi = t > 0 && hi < h;
    const k = inv[y];
    const o = y * w, ol = lo * w, oh = hi * w;
    for (let x = 0; x < w; x++) {
      let v = colAcc[x];
      if (useLo) v += src[ol + x] * t;
      if (useHi) v += src[oh + x] * t;
      dst[o + x] = v * k;
    }
    if (hi < h) for (let x = 0; x < w; x++) colAcc[x] += src[oh + x];
    if (y - R >= 0) {
      const os = (y - R) * w;
      for (let x = 0; x < w; x++) colAcc[x] -= src[os + x];
    }
  }
}

// Barrel distortion + RGB shift into packed words; bright pixels (r+g+b >
// 384) are summed per bloom block.
function distort(imageData, width, height, curveAmount, rgbShift, temp, bloom, bw, f, sm) {
  const [bR, bG, bB] = bloom;
  const invW = 2 / width, invH = 2 / height;
  const maxX = width - 1;
  const shift = Math.log2(f) | 0;
  // nx = ((u0·k + 1) / 2)·width with k = 1 + (u0² + v0²)·c splits into
  // per-column terms: nx = A[x] + B[x]·v0², and ny = C(y) + D(y)·u0².
  const A = new Float64Array(width), B = new Float64Array(width), U2 = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const u0 = x * invW - 1;
    A[x] = ((u0 * (1 + u0 * u0 * curveAmount) + 1) / 2) * width;
    B[x] = ((u0 * curveAmount) / 2) * width;
    U2[x] = u0 * u0;
  }
  const temp8 = new Uint8Array(temp.buffer);
  for (let y = 0; y < height; y++) {
    const v0 = y * invH - 1;
    const v2 = v0 * v0;
    const C = ((v0 * (1 + v2 * curveAmount) + 1) / 2) * height;
    const D = ((v0 * curveAmount) / 2) * height;
    const brow = (y >> shift) * bw;
    const sampleRow = (y & sm) === 0;
    for (let x = 0, j = y * width; x < width; x++, j++) {
      const nx = A[x] + B[x] * v2;
      const ny = C + D * U2[x];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const rowIdx = (ny | 0) * width;
      const xr = nx + rgbShift, xb = nx - rgbShift;
      const r = imageData[(rowIdx + (xr >= width ? maxX : xr | 0)) * 4];
      const g = imageData[(rowIdx + (nx | 0)) * 4 + 1];
      const b = imageData[(rowIdx + (xb < 0 ? 0 : xb | 0)) * 4 + 2];
      const t = j * 4;
      temp8[t] = r; temp8[t + 1] = g; temp8[t + 2] = b;
      if (sampleRow && (x & sm) === 0 && r + g + b > 384) {
        const bi = brow + (x >> shift);
        bR[bi] += r; bG[bi] += g; bB[bi] += b;
      }
    }
  }
}

function compose(temp, bloom, bw, bh, f, width, height, outputData, p) {
  const { scanK, scanlineIntensity, brightness, contrast, saturation, bloomIntensity, vignetteStrength } = p;
  const [pR, pG, pB] = bloom;
  const invW = 2 / width, invH = 2 / height;
  // Bilinear taps from pixel centres to block centres.
  const colI = new Int32Array(width), colT = new Float32Array(width);
  const vigX = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const vx = x * invW - 1;
    vigX[x] = vx < 0 ? -vx : vx;
    let fx = (x + 0.5) / f - 0.5;
    fx = fx < 0 ? 0 : fx > bw - 1 ? bw - 1 : fx;
    const i = Math.min(bw - 2, fx | 0);
    colI[x] = i < 0 ? 0 : i;
    colT[x] = bw > 1 ? fx - colI[x] : 0;
  }
  const rowR = new Float32Array(bw + 1), rowG = new Float32Array(bw + 1), rowB = new Float32Array(bw + 1);
  // Brightness, contrast and saturation are one affine map per channel:
  // c' = (c·brightness − 128)·contrast + 128, then mixed towards luminance.
  const bc = brightness * contrast, off = 128 - 128 * contrast;
  const s = saturation, l = 1 - s;
  const mrr = 0.299 * l + s, mrg = 0.587 * l, mrb = 0.114 * l;
  const mgr = 0.299 * l, mgg = 0.587 * l + s, mgb = 0.114 * l;
  const mbr = 0.299 * l, mbg = 0.587 * l, mbb = 0.114 * l + s;
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    let fy = (y + 0.5) / f - 0.5;
    fy = fy < 0 ? 0 : fy > bh - 1 ? bh - 1 : fy;
    const y0 = fy | 0, y1 = y0 + 1 < bh ? y0 + 1 : y0, ty = fy - y0;
    const a = y0 * bw, c = y1 * bw;
    for (let x = 0; x < bw; x++) {
      rowR[x] = (pR[a + x] + (pR[c + x] - pR[a + x]) * ty) * bloomIntensity;
      rowG[x] = (pG[a + x] + (pG[c + x] - pG[a + x]) * ty) * bloomIntensity;
      rowB[x] = (pB[a + x] + (pB[c + x] - pB[a + x]) * ty) * bloomIntensity;
    }
    rowR[bw] = rowR[bw - 1]; rowG[bw] = rowG[bw - 1]; rowB[bw] = rowB[bw - 1];
    const scanline = 1 - Math.abs(Math.sin(y * scanK)) * scanlineIntensity;
    const vy = y * invH - 1;
    const avy = vy < 0 ? -vy : vy;
    for (let x = 0, o = y * width; x < width; x++, o++) {
      const t = temp[o];
      const i = colI[x], tx = colT[x];
      const r0 = (t & 255) + rowR[i] + (rowR[i + 1] - rowR[i]) * tx;
      const g0 = ((t >>> 8) & 255) + rowG[i] + (rowG[i + 1] - rowG[i]) * tx;
      const b0 = ((t >>> 16) & 255) + rowB[i] + (rowB[i + 1] - rowB[i]) * tx;
      const r1 = r0 * bc + off, g1 = g0 * bc + off, b1 = b0 * bc + off;
      const avx = vigX[x];
      const vd = avx > avy ? avx : avy;
      const vig = (1 - vd * vd * vignetteStrength) * scanline;
      let r = (mrr * r1 + mrg * g1 + mrb * b1) * vig + 0.5;
      let g = (mgr * r1 + mgg * g1 + mgb * b1) * vig + 0.5;
      let b = (mbr * r1 + mbg * g1 + mbb * b1) * vig + 0.5;
      r = r < 1 ? 0 : r > 255 ? 255 : r | 0;
      g = g < 1 ? 0 : g > 255 ? 255 : g | 0;
      b = b < 1 ? 0 : b > 255 ? 255 : b | 0;
      out32[o] = r | (g << 8) | (b << 16) | 0xff000000;
    }
  }
}
