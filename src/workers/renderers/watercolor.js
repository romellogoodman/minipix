import { randFloat, createNoise2D, fitSize, downsampleImage } from "../utils.js";

const WORK_MAX = 1024;
const GRID_MAX = 256;
const PAPERS = [[251, 247, 236], [246, 242, 232], [252, 250, 245], [244, 236, 220]];
const INK = [62, 44, 34];

/**
 * Watercolour wash (after the Watercolor shader). The image is flattened
 * into soft patches by a Kuwahara filter at a working resolution, then
 * treated as pigment over paper: washes are thinned toward the paper colour,
 * pigment pools along patch boundaries (edge darkening), settles into the
 * paper grain (granulation) and bleeds past hard edges through a low-frequency
 * wobble of the lookup. Optional extras: a loose pen outline, and a wash that
 * fades out before the paper edge.
 */
export default function watercolor({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const radiusPct = randFloat(config.radiusPercent, random);
  const bleed = randFloat(config.bleed, random);
  const density = randFloat(config.density, random);
  const edgeDarken = randFloat(config.edgeDarken, random);
  const granulation = randFloat(config.granulation, random);
  const paper = PAPERS[Math.floor(random() * PAPERS.length)];
  const penLines = random() < config.penProbability;
  const vignette = random() < config.vignetteProbability;
  const seed = (random() * 4294967296) >>> 0;
  const noise = createNoise2D(random);

  // --- Work resolution: Kuwahara flattening via summed-area tables.
  const ds = downsampleImage(imageData, width, height, WORK_MAX);
  const { w, h } = ds;
  const radius = Math.max(2, Math.round(Math.min(w, h) * radiusPct));
  const flat = kuwahara(ds, w, h, radius);

  // Edge darkening: Sobel magnitude of the flattened luminance, softened a touch.
  const lumF = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lumF[i] = (0.299 * flat[i * 3] + 0.587 * flat[i * 3 + 1] + 0.114 * flat[i * 3 + 2]) / 255;
  const edge = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1) * w, y0 = y * w, yp = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
      const gx = -lumF[ym + xm] - 2 * lumF[y0 + xm] - lumF[yp + xm] + lumF[ym + xp] + 2 * lumF[y0 + xp] + lumF[yp + xp];
      const gy = -lumF[ym + xm] - 2 * lumF[ym + x] - lumF[ym + xp] + lumF[yp + xm] + 2 * lumF[yp + x] + lumF[yp + xp];
      edge[y0 + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 1.5);
    }
  }
  boxBlur(edge, w, h, 2, new Float32Array(w * h));

  // Pigment amount per channel (0 = bare paper), with edge pooling baked in.
  const pig = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const pool = 1 + edge[i] * edgeDarken;
    for (let c = 0; c < 3; c++) pig[i * 3 + c] = Math.min(1, (1 - flat[i * 3 + c] / 255) * density * pool);
  }

  // --- Low-res fields: bleed wobble (pixels), uneven wash strength, vignette.
  const { w: gw, h: gh } = fitSize(width, height, GRID_MAX);
  const cellW = width / gw, cellH = height / gh;
  const wobX = new Float32Array(gw * gh), wobY = new Float32Array(gw * gh), wash = new Float32Array(gw * gh);
  const amp = bleed * minDim * 0.006;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const px = (gx + 0.5) * cellW, py = (gy + 0.5) * cellH;
      const u = px / minDim, v = py / minDim;
      const i = gy * gw + gx;
      wobX[i] = (noise(u * 5, v * 5) + 0.5 * noise(u * 13, v * 13)) * amp;
      wobY[i] = (noise(u * 5 + 31.4, v * 5 + 31.4) + 0.5 * noise(u * 13 + 31.4, v * 13)) * amp;
      let m = 1 + 0.3 * noise(u * 3 + 70, v * 3);
      if (vignette) {
        // Distance to the nearest paper edge, roughened, as a soft fade.
        const d = Math.min(px, py, width - px, height - py) / minDim;
        let f = (d - 0.03 + 0.05 * noise(u * 4 + 90, v * 4)) / 0.12;
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        m *= f * f * (3 - 2 * f);
      }
      wash[i] = m;
    }
  }
  const x0s = new Int32Array(width), x1s = new Int32Array(width), fxs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(gw - 1, (x + 0.5) / cellW - 0.5));
    x0s[x] = Math.floor(g); x1s[x] = Math.min(gw - 1, x0s[x] + 1); fxs[x] = g - x0s[x];
  }

  // --- Optional pen line: full-res Sobel of lightly blurred luminance.
  let pen = null;
  if (penLines) {
    const n = width * height;
    const lum = new Float32Array(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) lum[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
    const r = Math.max(1, Math.round(minDim / 1200));
    boxBlur(lum, width, height, r, new Float32Array(n));
    pen = new Uint8Array(n);
    const s = r;
    for (let y = 0; y < height; y++) {
      const ym = Math.max(0, y - s) * width, y0 = y * width, yp = Math.min(height - 1, y + s) * width;
      for (let x = 0; x < width; x++) {
        const xm = Math.max(0, x - s), xp = Math.min(width - 1, x + s);
        const gx = -lum[ym + xm] - 2 * lum[y0 + xm] - lum[yp + xm] + lum[ym + xp] + 2 * lum[y0 + xp] + lum[yp + xp];
        const gy = -lum[ym + xm] - 2 * lum[ym + x] - lum[ym + xp] + lum[yp + xm] + 2 * lum[yp + x] + lum[yp + xp];
        const e = (Math.sqrt(gx * gx + gy * gy) - 0.35) / 0.4;
        pen[y0 + x] = e <= 0 ? 0 : e >= 1 ? 255 : e * 255;
      }
    }
  }

  // Seeded value noise for the paper grain.
  const hash = (ix, iy) => {
    let q = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    q = Math.imul(q ^ (q >>> 13), 1274126177);
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const grainScale = 1 / Math.max(1.2, minDim / 900);
  const sx = w / width, sy = h / height;

  for (let y = 0; y < height; y++) {
    const g = Math.max(0, Math.min(gh - 1, (y + 0.5) / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let x = 0; x < width; x++) {
      const a = x0s[x], b = x1s[x], fx = fxs[x];
      // Bilinear pigment lookup at the wobbled position.
      let wx = (x + 0.5 + lerpGrid(wobX, r0, r1, a, b, fx, fy)) * sx - 0.5, wy = (y + 0.5 + lerpGrid(wobY, r0, r1, a, b, fx, fy)) * sy - 0.5;
      wx = wx < 0 ? 0 : wx > w - 1 ? w - 1 : wx;
      wy = wy < 0 ? 0 : wy > h - 1 ? h - 1 : wy;
      const ix = Math.min(w - 2, Math.floor(wx)), iy = Math.min(h - 2, Math.floor(wy));
      const tx = wx - ix, ty = wy - iy;
      const p00 = (iy * w + ix) * 3, p10 = p00 + 3, p01 = p00 + w * 3, p11 = p01 + 3;

      // Paper grain: pigment settles into the valleys.
      const grain = vnoise(x * grainScale, y * grainScale) * 0.4 + vnoise(x * grainScale * 0.31 + 17, y * grainScale * 0.31) * 0.6;
      const settle = (1 + (0.5 - grain) * 2 * granulation) * lerpGrid(wash, r0, r1, a, b, fx, fy);
      const tooth = 1 - (0.5 - grain) * 0.06;

      const i = (y * width + x) * 4;
      const inkAmt = pen ? (pen[y * width + x] / 255) * (grain > 0.3 ? 1 : 0.4) : 0;
      for (let c = 0; c < 3; c++) {
        const top = pig[p00 + c] + (pig[p10 + c] - pig[p00 + c]) * tx;
        const bot = pig[p01 + c] + (pig[p11 + c] - pig[p01 + c]) * tx;
        let p = (top + (bot - top) * ty) * settle;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        const v = paper[c] * (1 - p) * tooth;
        outputData[i + c] = v + (INK[c] - v) * inkAmt * 0.85;
      }
      outputData[i + 3] = 255;
    }
  }
}

// Bilinear read of a low-res grid given precomputed row/column taps.
function lerpGrid(G, r0, r1, a, b, fx, fy) {
  const t = G[r0 + a] + (G[r0 + b] - G[r0 + a]) * fx;
  return t + (G[r1 + a] + (G[r1 + b] - G[r1 + a]) * fx - t) * fy;
}

// Kuwahara (4 quadrants, lowest colour variance wins) over RGB planes using
// summed-area tables. Returns interleaved RGB (0..255).
function kuwahara({ r, g, b }, w, h, radius) {
  const W = w + 1;
  const planes = [r, g, b];
  const sat = [];
  for (let c = 0; c < 6; c++) sat.push(new Float64Array(W * (h + 1)));
  for (let y = 1; y <= h; y++) {
    const row = [0, 0, 0, 0, 0, 0];
    for (let x = 1; x <= w; x++) {
      const si = (y - 1) * w + x - 1;
      for (let c = 0; c < 3; c++) {
        const v = planes[c][si];
        row[c] += v; row[c + 3] += v * v;
      }
      const i = y * W + x, up = i - W;
      for (let c = 0; c < 6; c++) sat[c][i] = sat[c][up] + row[c];
    }
  }
  const rect = (s, x0, y0, x1, y1) => s[(y1 + 1) * W + x1 + 1] - s[y0 * W + x1 + 1] - s[(y1 + 1) * W + x0] + s[y0 * W + x0];
  const out = new Float32Array(w * h * 3);
  const quads = [[-radius, 0, -radius, 0], [0, radius, -radius, 0], [-radius, 0, 0, radius], [0, radius, 0, radius]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      const o = (y * w + x) * 3;
      for (let q = 0; q < 4; q++) {
        const [dx0, dx1, dy0, dy1] = quads[q];
        const x0 = Math.max(0, x + dx0), x1 = Math.min(w - 1, x + dx1);
        const y0 = Math.max(0, y + dy0), y1 = Math.min(h - 1, y + dy1);
        const inv = 1 / ((x1 - x0 + 1) * (y1 - y0 + 1));
        const mr = rect(sat[0], x0, y0, x1, y1) * inv;
        const mg = rect(sat[1], x0, y0, x1, y1) * inv;
        const mb = rect(sat[2], x0, y0, x1, y1) * inv;
        const variance = rect(sat[3], x0, y0, x1, y1) * inv - mr * mr
          + rect(sat[4], x0, y0, x1, y1) * inv - mg * mg
          + rect(sat[5], x0, y0, x1, y1) * inv - mb * mb;
        if (variance < best) { best = variance; out[o] = mr; out[o + 1] = mg; out[o + 2] = mb; }
      }
    }
  }
  return out;
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
