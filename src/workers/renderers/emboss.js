import { randFloat, createNoise2D, fitSize } from "../utils.js";

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
  const noise = createNoise2D(random);

  const mode = modeRoll < config.stoneProbability ? "stone"
    : modeRoll < config.stoneProbability + config.plateProbability ? "plate" : "color";

  const n = width * height;
  const H = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    H[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
  }
  const tmp = new Float32Array(n);
  boxBlur(H, width, height, blur, tmp);
  boxBlur(H, width, height, blur, tmp);

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
        const wx = fbm(noise, px, py, 3), wy = fbm(noise, px + 5.2, py + 1.3, 3);
        sh0[y * sw + x] = 0.5 + 0.5 * fbm(noise, px + wx * 1.6, py + wy * 1.6, 6);
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

  let sy0 = 0, sy1 = 0, sfy = 0;
  for (let y = 0; y < height; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y < height - 1 ? y + 1 : height - 1;
    if (stone) {
      const g = Math.max(0, Math.min(stone.sh - 1, (y + 0.5) / stone.ch - 0.5));
      sy0 = Math.floor(g); sy1 = Math.min(stone.sh - 1, sy0 + 1); sfy = g - sy0;
    }
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const xm = x > 0 ? x - 1 : 0, xp = x < width - 1 ? x + 1 : width - 1;
      let dhx = ((H[y * width + xp] - H[y * width + xm]) / (xp - xm)) * slope;
      let dhy = ((H[yp * width + x] - H[ym * width + x]) / (yp - ym)) * slope;

      let sr = imageData[j * 4], sg = imageData[j * 4 + 1], sb = imageData[j * 4 + 2];
      let stoneBright = 1;
      if (stone) {
        const g = Math.max(0, Math.min(stone.sw - 1, (x + 0.5) / stone.cw - 0.5));
        const sx0 = Math.floor(g), sx1 = Math.min(stone.sw - 1, sx0 + 1), sfx = g - sx0;
        const a = sy0 * stone.sw + sx0, b = sy1 * stone.sw + sx0, dx = sx1 - sx0;
        const sgx = bil(stone.gx, a, b, dx, sfx, sfy), sgy = bil(stone.gy, a, b, dx, sfx, sfy);
        dhx += sgx * stoneSlope;
        dhy += sgy * stoneSlope;
        // Carved distortion: the colour lookup slides along the marble gradient.
        const ox = Math.round(x + sgx * warp), oy = Math.round(y + sgy * warp);
        const k = ((oy < 0 ? 0 : oy >= height ? height - 1 : oy) * width + (ox < 0 ? 0 : ox >= width ? width - 1 : ox)) * 4;
        sr = imageData[k]; sg = imageData[k + 1]; sb = imageData[k + 2];
        stoneBright = 1 + (bil(stone.h, a, b, dx, sfx, sfy) - 0.5) * 1.1;
      }

      // N·L relative to a flat surface: > 0 highlight, < 0 edge shadow.
      const inv = 1 / Math.sqrt(dhx * dhx + dhy * dhy + 1);
      const e = ((-dhx * lx - dhy * ly + lz) * inv - lz) * lightIntensity;
      const highlight = e > 0 ? e : 0;
      const edgeShadow = e < 0 ? -e : 0;

      // Cast shadow: is the surface toward the light higher than here?
      const hc = H[j] * sign;
      let cast = 0;
      for (let t = 0; t < 2; t++) {
        let qx = x + (t === 0 ? t1x : t2x), qy = y + (t === 0 ? t1y : t2y);
        qx = qx < 0 ? 0 : qx >= width ? width - 1 : qx;
        qy = qy < 0 ? 0 : qy >= height ? height - 1 : qy;
        let d = (H[qy * width + qx] * sign - hc) / shadowSoft;
        d = d <= 0 ? 0 : d >= 1 ? 1 : d * d * (3 - 2 * d);
        cast += d * (t === 0 ? 0.55 : 0.45);
      }
      let shadow = (edgeShadow + cast) * shadowIntensity;
      shadow = shadow > 1 ? 1 : shadow;

      let br, bg, bb;
      if (mode === "plate") { br = plate[0]; bg = plate[1]; bb = plate[2]; }
      else if (mode === "stone") {
        // Image pressed into the stone: its luminance modulates the stone tint, keeping a little colour.
        const l = (0.299 * sr + 0.587 * sg + 0.114 * sb) / 255;
        const k = (0.55 + 0.6 * l) * stoneBright;
        br = (stoneTint[0] * 0.7 + sr * 0.3) * k;
        bg = (stoneTint[1] * 0.7 + sg * 0.3) * k;
        bb = (stoneTint[2] * 0.7 + sb * 0.3) * k;
      } else { br = sr; bg = sg; bb = sb; }

      const hl = highlight * 255;
      const i = j * 4;
      outputData[i] = br * (1 - shadow) + hl;
      outputData[i + 1] = bg * (1 - shadow) + hl;
      outputData[i + 2] = bb * (1 - shadow) + hl;
      outputData[i + 3] = 255;
    }
  }
}

// Bilinear read of a grid from its top-left tap a, bottom-left tap b and column step dx.
function bil(G, a, b, dx, fx, fy) {
  const t = G[a] + (G[a + dx] - G[a]) * fx;
  return t + (G[b] + (G[b + dx] - G[b]) * fx - t) * fy;
}

function fbm(noise, x, y, octaves) {
  let s = 0, a = 1, m = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise(x, y);
    m += a;
    a *= 0.5; x *= 2; y *= 2;
  }
  return s / m;
}

// In-place separable box blur with running sums and clamped edges.
function boxBlur(a, w, h, r, tmp) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = a[o] * (r + 1);
    for (let i = 1; i <= r; i++) s += a[o + Math.min(i, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * inv;
      s += a[o + Math.min(x + r + 1, w - 1)] - a[o + Math.max(x - r, 0)];
    }
  }
  const acc = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let s = tmp[x] * (r + 1);
    for (let i = 1; i <= r; i++) s += tmp[Math.min(i, h - 1) * w + x];
    acc[x] = s;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w, add = Math.min(y + r + 1, h - 1) * w, sub = Math.max(y - r, 0) * w;
    for (let x = 0; x < w; x++) {
      a[o + x] = acc[x] * inv;
      acc[x] += tmp[add + x] - tmp[sub + x];
    }
  }
}
