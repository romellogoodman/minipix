import { randFloat, createNoise2D, fitSize, boxBlur } from "../utils.js";

const GRID_MAX = 256;
// Slate black, blackboard green, school blue-grey, charcoal brown.
const BOARDS = [[18, 20, 20], [34, 52, 44], [30, 38, 48], [36, 30, 28]];
const CHALK = [236, 234, 219];

/**
 * Chalk drawing on a blackboard (after the Chalkboard shader). A Sobel ring
 * at a stroke-width spacing turns edges into chalk outlines; up to three
 * hatch families (45°, −45°, 0°) fill the tone in steps, wobbled by low-res
 * noise so they look hand-drawn; value-noise dust breaks every stroke up, and
 * faint eraser smudges cloud the board. The tone can be hatched where the
 * image is bright (a positive drawing) or, as in the shader, where it is dark.
 */
export default function chalkboard({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const spacing = Math.max(1, Math.round(minDim * randFloat(config.strokePercent, random)));
  const sensitivity = randFloat(config.sensitivity, random);
  const hatch = Math.max(3, minDim * randFloat(config.hatchPercent, random));
  const shading = randFloat(config.shading, random);
  const grain = randFloat(config.grain, random);
  const smudge = randFloat(config.smudge, random);
  const hatchLights = random() < config.hatchLightsProbability;
  const colorChalk = random() < config.colorChalkProbability;
  const board = BOARDS[Math.floor(random() * BOARDS.length)];
  const hatchAngle = (random() - 0.5) * 0.5; // slight hand tilt of the whole hatch set
  const seed = (random() * 4294967296) >>> 0;
  const noise = createNoise2D(random);

  // Luminance, pre-blurred to about the stroke width so the Sobel ring sees forms, not texture.
  const n = width * height;
  const lum = luminance(imageData, n);
  boxBlur(lum, width, height, Math.max(1, spacing >> 1), new Float32Array(n));
  // Tone for the hatching: stretched between the 4th and 96th percentiles.
  const hist = new Uint32Array(256);
  // (Sampled on every other row and column on large images.)
  const hs = minDim >= 1600 ? 2 : 1;
  let hn = 0;
  for (let y = 0; y < height; y += hs) {
    for (let x = 0, j = y * width; x < width; x += hs, j += hs) { hist[Math.min(255, (lum[j] * 255) | 0)]++; hn++; }
  }
  let lo = 0, hi = 255;
  for (let c = 0, k = 0; k < 256; k++) { c += hist[k]; if (c >= hn * 0.04) { lo = k; break; } }
  for (let c = 0, k = 255; k >= 0; k--) { c += hist[k]; if (c >= hn * 0.04) { hi = k; break; } }

  // The hatching is soft-edged and low-frequency, so on larger images it is
  // computed at half resolution (from 2×2-averaged tone) and upsampled.
  const sc = minDim >= 1600 ? 2 : 1;
  const W = Math.floor(width / sc), H = Math.floor(height / sc), N = W * H;
  let tonePlane = lum;
  if (sc === 2) {
    tonePlane = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const ya = 2 * y * width, yb = ya + width;
      for (let x = 0; x < W; x++) {
        tonePlane[y * W + x] = (lum[ya + 2 * x] + lum[ya + 2 * x + 1] + lum[yb + 2 * x] + lum[yb + 2 * x + 1]) * 0.25;
      }
    }
  }
  const toneScale = 255 / Math.max(16, hi - lo), toneLo = lo / 255;

  // Low-res noise: hatch wobble (in pixels) and eraser smudges.
  const { w: gw, h: gh } = fitSize(width, height, GRID_MAX);
  const cellW = width / gw, cellH = height / gh;
  const wobble = new Float32Array(gw * gh), smear = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const u = ((gx + 0.5) * cellW) / minDim, v = ((gy + 0.5) * cellH) / minDim;
      wobble[gy * gw + gx] = (noise(u * 9, v * 9) + 0.5 * noise(u * 23, v * 23)) * hatch * 0.35;
      const s = noise(u * 2.5 + 11, v * 2.5) + 0.5 * noise(u * 6 + 11, v * 6) + 0.25 * noise(u * 14 + 11, v * 14);
      smear[gy * gw + gx] = Math.max(0, s + 0.15);
    }
  }
  // Bilinear column tables: full-res pixel → grid cell, and work-res pixel → grid cell.
  const colTable = (count, px) => {
    const i0 = new Int32Array(count), i1 = new Int32Array(count), f = new Float32Array(count);
    for (let x = 0; x < count; x++) {
      const g = Math.max(0, Math.min(gw - 1, px(x) / cellW - 0.5));
      i0[x] = Math.floor(g); i1[x] = Math.min(gw - 1, i0[x] + 1); f[x] = g - i0[x];
    }
    return { i0, i1, f };
  };
  const fullCols = colTable(width, (x) => x + 0.5);
  const workCols = colTable(W, (x) => (x + 0.5) * sc);
  const gridRow = (G, out, yc) => {
    const g = Math.max(0, Math.min(gh - 1, yc / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let q = 0; q < gw; q++) out[q] = G[r0 + q] + (G[r1 + q] - G[r0 + q]) * fy;
  };

  // Seeded lattice hash → smooth value noise in [0, 1).
  const hash = (ix, iy) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const dustScale = 1 / Math.max(1.5, minDim / 700);
  // The dust/board noise is sampled on an axis-aligned grid (px * xs + xo, py * ys), so its
  // per-column lattice terms and the per-row hash values are tabulated; the blend is unchanged.
  const lattice = (xs, xo, ys) => {
    const ix = new Int32Array(width), ux = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      const X = x * dustScale * xs + xo;
      ix[x] = Math.floor(X);
      const f = X - ix[x];
      ux[x] = f * f * (3 - 2 * f);
    }
    const span = ix[width - 1] + 2;
    const L = { ix, ux, uy: 0, iy: NaN, row0: new Float64Array(span), row1: new Float64Array(span) };
    // Rows of lattice hashes are cached; stepping down one lattice row reuses row1.
    L.setRow = (y) => {
      const Y = y * dustScale * ys;
      const iy = Math.floor(Y), fy = Y - iy;
      L.uy = fy * fy * (3 - 2 * fy);
      if (iy === L.iy) return;
      if (iy === L.iy + 1) {
        const t = L.row0; L.row0 = L.row1; L.row1 = t;
        for (let k = ix[0]; k < span; k++) L.row1[k] = hash(k, iy + 1);
      } else {
        for (let k = ix[0]; k < span; k++) { L.row0[k] = hash(k, iy); L.row1[k] = hash(k, iy + 1); }
      }
      L.iy = iy;
    };
    // Vertically blended lattice row for the current pixel row: the bilinear
    // blend is then a 1-D lerp per pixel (same value, regrouped).
    L.col = new Float64Array(span);
    L.blend = () => {
      const r0 = L.row0, r1 = L.row1, uy = L.uy, col = L.col;
      for (let k = ix[0]; k < span; k++) col[k] = r0[k] + (r1[k] - r0[k]) * uy;
    };
    return L;
  };
  const dust1 = lattice(1, 0, 1), dust2 = lattice(2.7, 9, 2.7), lift = lattice(1.8, 50, 1.8);

  const edgeHigh = 1 + (0.08 - 1) * sensitivity;
  const edgeLow = edgeHigh * 0.4;
  const invHatch = 1 / hatch;
  const invStroke = 1 / (hatch * 5);
  const fams = [
    [Math.sin(0.785 + hatchAngle), Math.cos(0.785 + hatchAngle), 0.22],
    [Math.sin(-0.785 + hatchAngle), Math.cos(-0.785 + hatchAngle), 0.5],
    [Math.sin(hatchAngle), Math.cos(hatchAngle), 0.78],
  ];

  // The stroke-pressure noise is sampled at (along-stroke / stroke length,
  // line·1.37 + k·17.1): only a few hundred lattice cells per family, so their
  // hashes are tabulated up front (identical values to calling hash()).
  let wobMin = 0, wobMax = 0;
  for (let i = 0; i < gw * gh; i++) { if (wobble[i] < wobMin) wobMin = wobble[i]; if (wobble[i] > wobMax) wobMax = wobble[i]; }
  const famTabs = fams.map(([sa, ca], k) => {
    let sMin = Infinity, sMax = -Infinity, rMin = Infinity, rMax = -Infinity;
    for (const [cx, cy] of [[0, 0], [width, 0], [0, height], [width, height]]) {
      const sv = (cx * ca - cy * sa) * invStroke, rv = cx * sa + cy * ca;
      if (sv < sMin) sMin = sv; if (sv > sMax) sMax = sv;
      if (rv < rMin) rMin = rv; if (rv > rMax) rMax = rv;
    }
    const ix0 = Math.floor(sMin) - 1, tw = Math.floor(sMax) + 3 - ix0;
    const line0 = Math.floor((rMin + wobMin) * invHatch) - 1, line1 = Math.floor((rMax + wobMax) * invHatch) + 1;
    const iy0 = Math.floor(line0 * 1.37 + k * 17.1) - 1, th = Math.floor(line1 * 1.37 + k * 17.1) + 3 - iy0;
    const tab = new Float64Array(tw * th);
    for (let r = 0; r < th; r++) for (let c = 0; c < tw; c++) tab[r * tw + c] = hash(ix0 + c, iy0 + r);
    return { tab, ix0, iy0, tw, th };
  });
  const segNoise = (T, sx, Y) => {
    const ix = Math.floor(sx), iy = Math.floor(Y);
    const c = ix - T.ix0, r = iy - T.iy0;
    if (c < 0 || r < 0 || c + 1 >= T.tw || r + 1 >= T.th) return vnoise(sx, Y);
    const fx = sx - ix, fy = Y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const o = r * T.tw + c, tab = T.tab;
    const a = tab[o], b = tab[o + 1], cc = tab[o + T.tw], d = tab[o + T.tw + 1];
    return a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy;
  };

  // Pass 1 (work resolution): hatching + rubbed haze.
  const cov = new Float32Array(N);
  {
    const wobRow = new Float32Array(gw);
    const { i0, i1, f } = workCols;
    for (let y = 0; y < H; y++) {
      const py = (y + 0.5) * sc - 0.5; // full-res pixel coordinate of this sample
      gridRow(wobble, wobRow, py + 0.5);
      hatchRow(y * W, py);
    }
    function hatchRow(y0, py) {
      for (let x = 0; x < W; x++) {
        let tone = (tonePlane[y0 + x] - toneLo) * toneScale;
        tone = tone < 0 ? 0 : tone > 1 ? 1 : tone;
        const shade = hatchLights ? tone : 1 - tone;
        let h = 0;
        if (shade >= 0.22) {
          const px = (x + 0.5) * sc - 0.5;
          const wa = wobRow[i0[x]];
          const wob = wa + (wobRow[i1[x]] - wa) * f[x];
          for (let k = 0; k < 3; k++) {
            const fam = fams[k], sa = fam[0], ca = fam[1], thr = fam[2];
            if (shade < thr) break;
            const ry = (px * sa + py * ca + wob) * invHatch;
            const line = Math.floor(ry);
            const hl = Math.abs(ry - line - 0.5) * 2;
            if (hl >= 0.4) continue;
            const u = hl / 0.4;
            // Each hatch line breaks into separate strokes of varying pressure.
            const seg = segNoise(famTabs[k], (px * ca - py * sa) * invStroke, line * 1.37 + k * 17.1);
            const press = (seg - 0.32) * 6;
            if (press <= 0) continue;
            const q = (1 - u * u * (3 - 2 * u)) * (press > 1 ? 1 : press) * (0.55 + 0.45 * seg);
            if (q > h) h = q;
          }
        }
        // Rubbed-in chalk haze under the hatching, strongest at the fullest tone.
        const rub = shade > 0.5 ? (shade - 0.5) * 0.7 : 0;
        cov[y0 + x] = (h > rub ? h : rub) * shading;
      }
    }
  }

  // Pass 2 (full resolution): dust grain, board smudges, colour.
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);
  const sp = spacing, edgeInv = 1 / (edgeHigh - edgeLow), edgeLow2 = edgeLow * edgeLow;
  const eRow = new Float32Array(width), vSum = new Float32Array(width), vDif = new Float32Array(width);
  const mRow = new Float32Array(width), covRow = new Float32Array(W), smearRow = new Float32Array(gw);
  const cx0 = new Int32Array(width), cx1 = new Int32Array(width), cfx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(W - 1, (x + 0.5) / sc - 0.5));
    cx0[x] = Math.floor(g); cx1[x] = Math.min(W - 1, cx0[x] + 1); cfx[x] = g - cx0[x];
  }
  const grainK = grain * 0.45, grainInv = 1 / (1 - grain * 0.45), grainMul = 1 + grain;
  const lift0 = smudge * 0.22;
  const bR = board[0], bG = board[1], bB = board[2];
  const dR = CHALK[0] - bR, dG = CHALK[1] - bG, dB = CHALK[2] - bB;
  const { i0: sx0, i1: sx1, f: sfx } = fullCols;

  // Fixed chalk colour: board→chalk mixes tabulated over 256 board-lift steps
  // (spanning the lift's actual range) × 256 chalk-coverage steps.
  let mixLut = null, liftLo = 0, liftQ = 0;
  if (!colorChalk) {
    let smax = 0;
    for (let i = 0; i < gw * gh; i++) if (smear[i] > smax) smax = smear[i];
    liftLo = -0.02;
    const liftHi = smax * lift0 + 0.02;
    liftQ = 255 / Math.max(1e-6, liftHi - liftLo);
    mixLut = new Uint32Array(65536);
    for (let qb = 0; qb < 256; qb++) {
      const bl = liftLo + qb / liftQ;
      const br0 = bR + dR * bl, bg0 = bG + dG * bl, bb0 = bB + dB * bl;
      for (let qm = 0; qm < 256; qm++) {
        const m = qm / 255;
        mixLut[(qb << 8) | qm] = 0xff000000 | (clamp8(bb0 + (CHALK[2] - bb0) * m) << 16) |
          (clamp8(bg0 + (CHALK[1] - bg0) * m) << 8) | clamp8(br0 + (CHALK[0] - br0) * m);
      }
    }
  }

  for (let y = 0; y < height; y++) {
    dust1.setRow(y); dust2.setRow(y); lift.setRow(y);
    dust1.blend(); dust2.blend(); lift.blend();
    gridRow(smear, smearRow, y + 0.5);
    const g = Math.max(0, Math.min(H - 1, (y + 0.5) / sc - 0.5));
    lerpRow(cov, covRow, Math.floor(g) * W, Math.min(H - 1, Math.floor(g) + 1) * W, g - Math.floor(g), W);
    sobelRow(y);
    dustRow(dust1.col, dust2.col);
    boardRow(y * width, lift.col);
  }

  // Sobel ring at the stroke spacing → outline strength (full resolution),
  // done separably: vertical [1 2 1] sums and [−1 0 1] differences per column.
  function sobelRow(y) {
    const ym = (y - sp < 0 ? 0 : y - sp) * width, y0 = y * width, yp = (y + sp >= height ? height - 1 : y + sp) * width;
    for (let x = 0; x < width; x++) {
      const t = lum[ym + x], b = lum[yp + x];
      vSum[x] = t + 2 * lum[y0 + x] + b;
      vDif[x] = b - t;
    }
    for (let x = 0; x < width; x++) {
      const xm = x - sp < 0 ? 0 : x - sp, xp = x + sp >= width ? width - 1 : x + sp;
      const gx = vSum[xp] - vSum[xm];
      const gy = vDif[xm] + 2 * vDif[x] + vDif[xp];
      const m2 = gx * gx + gy * gy;
      if (m2 <= edgeLow2) { eRow[x] = 0; continue; }
      const e = (Math.sqrt(m2) - edgeLow) * edgeInv;
      eRow[x] = e >= 1 ? 1 : e * e * (3 - 2 * e);
    }
  }

  // Chalk only catches the board's high spots: contrasty two-octave dust.
  function dustRow(v1, v2) {
    const ix1 = dust1.ix, ux1 = dust1.ux, ix2 = dust2.ix, ux2 = dust2.ux;
    for (let x = 0; x < width; x++) {
      const ca = covRow[cx0[x]];
      const hh = ca + (covRow[cx1[x]] - ca) * cfx[x];
      const ee = eRow[x];
      const eh = ee > hh ? ee : hh;
      if (eh <= 0) { mRow[x] = 0; continue; }
      const k1 = ix1[x], k2 = ix2[x];
      const n1 = v1[k1] + (v1[k1 + 1] - v1[k1]) * ux1[x];
      const n2 = v2[k2] + (v2[k2 + 1] - v2[k2]) * ux2[x];
      let dust = (n1 * 0.65 + n2 * 0.35 - grainK) * grainInv;
      dust = dust < 0 ? 0 : dust * grainMul;
      const m = eh * dust;
      mRow[x] = m > 1 ? 1 : m;
    }
  }

  // Board (smudges + fine lift grain) under the chalk, then the chalk colour.
  function boardRow(y0, lv) {
    const lix = lift.ix, lux = lift.ux;
    const cR = CHALK[0], cG = CHALK[1], cB = CHALK[2];
    for (let x = 0; x < width; x++) {
      const sa0 = smearRow[sx0[x]];
      const sm = sa0 + (smearRow[sx1[x]] - sa0) * sfx[x];
      const k = lix[x];
      const ln = lv[k] + (lv[k + 1] - lv[k]) * lux[x];
      const boardLift = sm * lift0 + (ln - 0.5) * 0.04;
      const m = mRow[x];
      if (mixLut !== null) {
        let qb = ((boardLift - liftLo) * liftQ + 0.5) | 0;
        if (qb < 0) qb = 0; else if (qb > 255) qb = 255;
        out32[y0 + x] = mixLut[(qb << 8) | ((m * 255 + 0.5) | 0)];
        continue;
      }
      let cr = cR, cg = cG, cb = cB;
      if (colorChalk) {
        // Pastel sticks: the source colour, saturated and lifted toward white.
        const i = (y0 + x) * 4;
        const sr = imageData[i], sg = imageData[i + 1], sb2 = imageData[i + 2];
        const sl = 0.299 * sr + 0.587 * sg + 0.114 * sb2;
        cr = 150 + (sl + (sr - sl) * 1.6) * 0.45;
        cg = 150 + (sl + (sg - sl) * 1.6) * 0.45;
        cb = 150 + (sl + (sb2 - sl) * 1.6) * 0.45;
      }
      const br0 = bR + dR * boardLift, bg0 = bG + dG * boardLift, bb0 = bB + dB * boardLift;
      out32[y0 + x] = 0xff000000 | (clamp8(bb0 + (cb - bb0) * m) << 16) | (clamp8(bg0 + (cg - bg0) * m) << 8) | clamp8(br0 + (cr - br0) * m);
    }
  }
}

function luminance(imageData, n) {
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    lum[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
  }
  return lum;
}

function lerpRow(G, out, r0, r1, f, count) {
  for (let x = 0; x < count; x++) out[x] = G[r0 + x] + (G[r1 + x] - G[r0 + x]) * f;
}

// Uint8ClampedArray store semantics (round, clamp) for a packed write.
function clamp8(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}