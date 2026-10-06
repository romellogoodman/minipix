import { randFloat, fitSize, createPermutation, noise2D } from "../utils.js";

const STONE_MAX = 768;
// Plate tints for the monochrome mode: steel grey, brass, copper, pewter blue.
const PLATES = [[128, 128, 128], [160, 128, 70], [150, 92, 64], [112, 124, 140]];
// Stone tints: travertine, slate, sandstone, marble.
const STONES = [[214, 200, 176], [120, 126, 130], [196, 150, 110], [228, 226, 220]];

/**
 * Relief shading (after the Emboss and Stone shaders). Blurred luminance is a
 * height map lit by a random directional light: the surface normal's N·L
 * (relative to a flat surface) gives highlights and edge shadows, and two
 * taps toward the light add a short cast shadow. The relief is laid over the
 * colour image, cast as a monochrome metal plate, or carved into stone — where
 * a domain-warped fbm marble adds its own relief, bends the colour lookup and
 * tints the image toward the stone.
 */
export default function emboss({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const blur = Math.max(1, Math.round(minDim * randFloat(config.blurPercent, random)));
  let depth = randFloat(config.depth, random);
  const angle = random() * Math.PI * 2;
  const elevation = (randFloat(config.elevation, random) * Math.PI) / 180;
  const lightIntensity = randFloat(config.lightIntensity, random);
  const shadowIntensity = randFloat(config.shadowIntensity, random);
  const stoneScale = randFloat(config.stoneScale, random);
  const distortion = randFloat(config.distortion, random);
  const modeRoll = random();
  if (random() < config.debossProbability) depth = -depth;
  const plate = PLATES[Math.floor(random() * PLATES.length)];
  const stoneTint = STONES[Math.floor(random() * STONES.length)];
  const perm = createPermutation(random);

  const mode = modeRoll < config.stoneProbability ? "stone"
    : modeRoll < config.stoneProbability + config.plateProbability ? "plate" : "color";

  const n = width * height;
  const H = lumaBlur2(imageData, width, height, blur);

  // Stone: marble height + gradient on a low-res grid, gradients in per-pixel units.
  let stone = null;
  if (mode === "stone") {
    const { w: sw, h: sh } = fitSize(width, height, STONE_MAX);
    const sh0 = new Float32Array(sw * sh);
    const f = (4 * stoneScale) / minDim;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const px = ((x + 0.5) * width) / sw * f, py = ((y + 0.5) * height) / sh * f;
        // Domain warp by a low-octave fbm pair, then a 6-octave fbm.
        const wx = fbm(perm, px, py, 3), wy = fbm(perm, px + 5.2, py + 1.3, 3);
        sh0[y * sw + x] = 0.5 + 0.5 * fbm(perm, px + wx * 1.6, py + wy * 1.6, 6);
      }
    }
    const gxs = new Float32Array(sw * sh), gys = new Float32Array(sw * sh);
    const cw = width / sw, ch = height / sh;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(sw - 1, x + 1);
        const ym = Math.max(0, y - 1), yp = Math.min(sh - 1, y + 1);
        gxs[y * sw + x] = (sh0[y * sw + xp] - sh0[y * sw + xm]) / ((xp - xm) * cw);
        gys[y * sw + x] = (sh0[yp * sw + x] - sh0[ym * sw + x]) / ((yp - ym) * ch);
      }
    }
    stone = { sw, sh, h: sh0, gx: gxs, gy: gys, cw, ch };
  }

  // Light vector (toward the light), normalized with a z from the elevation.
  const lx = Math.cos(angle) * Math.cos(elevation), ly = Math.sin(angle) * Math.cos(elevation);
  const lz = Math.sin(elevation);
  // Height units → pixels: slopes are resolution independent.
  const slope = depth * minDim * 0.02;
  const stoneSlope = Math.abs(depth) * minDim * 0.03;
  const absDepth = Math.abs(depth);
  const spread = Math.max(2, absDepth * minDim * 0.004);
  const t1x = Math.round(Math.cos(angle) * spread * 0.5), t1y = Math.round(Math.sin(angle) * spread * 0.5);
  const t2x = Math.round(Math.cos(angle) * spread), t2y = Math.round(Math.sin(angle) * spread);
  const shadowSoft = 0.06 * absDepth;
  // Marble gradients are ~4·stoneScale per minDim; scale them to a pixel offset.
  const warp = (distortion * minDim * minDim * 0.01) / (4 * stoneScale);
  const sign = depth < 0 ? -1 : 1;

  const modeId = mode === "plate" ? 1 : mode === "stone" ? 2 : 0;
  const pr = plate[0], pg = plate[1], pb = plate[2];
  const st0 = stoneTint[0] * 0.7, st1 = stoneTint[1] * 0.7, st2 = stoneTint[2] * 0.7;
  const t1o = t1y * width + t1x, t2o = t2y * width + t2x;
  // Stone column lookups, once per column rather than per pixel.
  let SX0 = null, SDX = null, SFX = null, SGX = null, SGY = null, SH = null, ssw = 0;
  let RGX = null, RGY = null, RH = null, RSX = null, RSY = null, RB = null, ROFF = null;
  if (stone) {
    ssw = stone.sw; SGX = stone.gx; SGY = stone.gy; SH = stone.h;
    RGX = new Float32Array(ssw); RGY = new Float32Array(ssw); RH = new Float32Array(ssw);
    RSX = new Float64Array(width); RSY = new Float64Array(width); RB = new Float64Array(width); ROFF = new Int32Array(width);
    SX0 = new Int32Array(width); SDX = new Int32Array(width); SFX = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      const g = Math.max(0, Math.min(ssw - 1, (x + 0.5) / stone.cw - 0.5));
      const sx0 = Math.floor(g);
      SX0[x] = sx0; SDX[x] = Math.min(ssw - 1, sx0 + 1) - sx0; SFX[x] = g - sx0;
    }
  }

  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, n);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);
  const invSoft = 1 / shadowSoft;
  for (let y = 0; y < height; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y < height - 1 ? y + 1 : height - 1;
    const sdy = slope / (yp - ym);
    if (stone) {
      const g = Math.max(0, Math.min(stone.sh - 1, (y + 0.5) / stone.ch - 0.5));
      const sy0 = Math.floor(g), sy1 = Math.min(stone.sh - 1, sy0 + 1), sfy = g - sy0;
      // Interpolate the marble rows once; columns are lerped per pixel.
      const a = sy0 * ssw, b = sy1 * ssw;
      for (let k = 0; k < ssw; k++) {
        RGX[k] = SGX[a + k] + (SGX[b + k] - SGX[a + k]) * sfy;
        RGY[k] = SGY[a + k] + (SGY[b + k] - SGY[a + k]) * sfy;
        RH[k] = SH[a + k] + (SH[b + k] - SH[a + k]) * sfy;
      }
      // Per-pixel marble terms for this row: relief slope, carved lookup, brightness.
      const yb = y + 1048576.5;
      for (let x = 0; x < width; x++) {
        const sx0 = SX0[x], sx1 = sx0 + SDX[x], sfx = SFX[x];
        const g0 = RGX[sx0], h0 = RGY[sx0], k0 = RH[sx0];
        const sgx = g0 + (RGX[sx1] - g0) * sfx, sgy = h0 + (RGY[sx1] - h0) * sfx;
        RSX[x] = sgx * stoneSlope; RSY[x] = sgy * stoneSlope;
        // Carved distortion: the colour lookup slides along the marble gradient.
        // Math.round via a positive bias (offsets are far below 2^20 px).
        const ox = ((x + sgx * warp + 1048576.5) | 0) - 1048576, oy = ((sgy * warp + yb) | 0) - 1048576;
        ROFF[x] = (oy < 0 ? 0 : oy >= height ? height - 1 : oy) * width + (ox < 0 ? 0 : ox >= width ? width - 1 : ox);
        RB[x] = 1 + (k0 + (RH[sx1] - k0) * sfx - 0.5) * 1.1;
      }
    }
    const row = y * width, rowM = ym * width, rowP = yp * width;
    // Cast-shadow taps stay inside the image when no clamp is needed.
    const y1ok = y + t1y >= 0 && y + t1y < height, y2ok = y + t2y >= 0 && y + t2y < height;
    const q1row = (y + t1y < 0 ? 0 : y + t1y >= height ? height - 1 : y + t1y) * width;
    const q2row = (y + t2y < 0 ? 0 : y + t2y >= height ? height - 1 : y + t2y) * width;
    for (let x = 0; x < width; x++) {
      const j = row + x;
      let dhx, dhy = (H[rowP + x] - H[rowM + x]) * sdy;
      if (x > 0 && x < width - 1) dhx = (H[j + 1] - H[j - 1]) * slope * 0.5;
      else dhx = (H[row + (x < width - 1 ? x + 1 : x)] - H[row + (x > 0 ? x - 1 : x)]) * slope;

      let px, stoneBright = 1;
      if (modeId === 2) {
        dhx += RSX[x]; dhy += RSY[x];
        px = src32[ROFF[x]];
        stoneBright = RB[x];
      } else px = src32[j];
      const sr = px & 255, sg = (px >>> 8) & 255, sb = (px >>> 16) & 255;

      // N·L relative to a flat surface: > 0 highlight, < 0 edge shadow.
      const inv = 1 / Math.sqrt(dhx * dhx + dhy * dhy + 1);
      const e = ((-dhx * lx - dhy * ly + lz) * inv - lz) * lightIntensity;

      // Cast shadow: is the surface toward the light higher than here?
      const hc = H[j] * sign;
      const x1 = x + t1x, x2 = x + t2x;
      const q1 = y1ok && x1 >= 0 && x1 < width ? j + t1o : q1row + (x1 < 0 ? 0 : x1 >= width ? width - 1 : x1);
      const q2 = y2ok && x2 >= 0 && x2 < width ? j + t2o : q2row + (x2 < 0 ? 0 : x2 >= width ? width - 1 : x2);
      let d1 = (H[q1] * sign - hc) * invSoft;
      d1 = d1 <= 0 ? 0 : d1 >= 1 ? 1 : d1 * d1 * (3 - 2 * d1);
      let d2 = (H[q2] * sign - hc) * invSoft;
      d2 = d2 <= 0 ? 0 : d2 >= 1 ? 1 : d2 * d2 * (3 - 2 * d2);
      let shadow = ((e < 0 ? -e : 0) + d1 * 0.55 + d2 * 0.45) * shadowIntensity;
      shadow = shadow > 1 ? 1 : shadow;

      let br, bg, bb;
      if (modeId === 1) { br = pr; bg = pg; bb = pb; }
      else if (modeId === 2) {
        // Image pressed into the stone: its luminance modulates the stone tint, keeping a little colour.
        const l = (0.299 * sr + 0.587 * sg + 0.114 * sb) / 255;
        const k = (0.55 + 0.6 * l) * stoneBright;
        br = (st0 + sr * 0.3) * k;
        bg = (st1 + sg * 0.3) * k;
        bb = (st2 + sb * 0.3) * k;
      } else { br = sr; bg = sg; bb = sb; }

      // Rounded, clamped, packed RGBA (values are never negative).
      const hl = (e > 0 ? e * 255 : 0) + 0.5;
      const ns = 1 - shadow;
      let r = (br * ns + hl) | 0, g = (bg * ns + hl) | 0, b = (bb * ns + hl) | 0;
      r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
      out32[j] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
}

// Luminance, box-blurred twice (radius r, clamped edges): the same result as two
// utils boxBlur passes, reordered as both horizontal passes per row (in cache)
// then two vertical passes, so the planes are walked 3 times instead of 9.
function lumaBlur2(img, w, h, r) {
  const n = w * h, inv = 1 / (2 * r + 1);
  const A = new Float32Array(n), B = new Float32Array(n);
  const row = new Float32Array(w), row2 = new Float32Array(w);
  const src = new Uint32Array(img.buffer, img.byteOffset, n);
  const LR = new Float64Array(256), LG = new Float64Array(256), LB = new Float64Array(256);
  for (let v = 0; v < 256; v++) { LR[v] = (0.299 * v) / 255; LG[v] = (0.587 * v) / 255; LB[v] = (0.114 * v) / 255; }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const p = src[o + x];
      row[x] = LR[p & 255] + LG[(p >>> 8) & 255] + LB[(p >>> 16) & 255];
    }
    hbox(row, row2, w, r, inv);
    hbox(row2, A.subarray(o, o + w), w, r, inv);
  }
  vbox(A, B, w, h, r, inv);
  vbox(B, A, w, h, r, inv);
  return A;
}

function hbox(src, dst, w, r, inv) {
  if (w <= 2 * r + 2) {
    let s = src[0] * (r + 1);
    for (let i = 1; i <= r; i++) s += src[Math.min(i, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[x] = s * inv;
      s += src[Math.min(x + r + 1, w - 1)] - src[Math.max(x - r, 0)];
    }
    return;
  }
  let s = src[0] * (r + 1);
  for (let i = 1; i <= r; i++) s += src[i];
  let x = 0;
  const s0 = src[0], last = src[w - 1];
  for (; x < r; x++) { dst[x] = s * inv; s += src[x + r + 1] - s0; }
  for (; x < w - r - 1; x++) { dst[x] = s * inv; s += src[x + r + 1] - src[x - r]; }
  for (; x < w; x++) { dst[x] = s * inv; s += last - src[x - r]; }
}

function vbox(src, dst, w, h, r, inv) {
  const acc = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let s = src[x] * (r + 1);
    for (let i = 1; i <= r; i++) s += src[Math.min(i, h - 1) * w + x];
    acc[x] = s;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w, add = Math.min(y + r + 1, h - 1) * w, sub = Math.max(y - r, 0) * w;
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc[x] * inv;
      acc[x] += src[add + x] - src[sub + x];
    }
  }
}

// fbm of createNoise2D's noise (as noise2D over a createPermutation table).
function fbm(perm, x, y, octaves) {
  let s = 0, a = 1, m = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise2D(perm, x, y);
    m += a;
    a *= 0.5; x *= 2; y *= 2;
  }
  return s / m;
}
