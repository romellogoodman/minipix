import { randFloat, createNoise2D, fitSize, computeOrientationField, boxBlur } from "../utils.js";

const GRID_MAX = 256;
// [ink, paper] pairs: iron-gall black, sepia, banknote green, navy, oxblood.
const PLATES = [
  [[26, 20, 16], [244, 238, 226]],
  [[70, 40, 22], [242, 230, 206]],
  [[18, 60, 44], [236, 238, 222]],
  [[20, 32, 70], [240, 238, 230]],
  [[90, 18, 24], [246, 236, 222]],
];

/**
 * Copper-plate line engraving (after the Engraving shader). Each "plate" is a
 * cosine wave across a phase field; darker tone lowers the inking threshold so
 * lines swell until they merge, and brightness shifts the phase so lines climb
 * over the form. The phase field lives on a low-res grid: a straight ramp, or
 * — in flow mode — a least-squares integration of the image's orientation
 * field so lines bend along its contours. Cross-hatch adds two shadow plates;
 * spiral is one continuous cut around a centre.
 */
export default function engraving({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const period = minDim / randFloat(config.lines, random);
  const relief = randFloat(config.relief, random);
  const waviness = randFloat(config.waviness, random);
  const contrast = randFloat(config.contrast, random);
  const styleRoll = random();
  const flow = random() < config.flowProbability;
  const baseAngle = random() * 180;
  const cx = (0.3 + random() * 0.4) * width;
  const cy = (0.3 + random() * 0.4) * height;
  const [inkRGB, paperRGB] = PLATES[Math.floor(random() * PLATES.length)];
  const colorInk = random() < config.colorInkProbability;
  const noise = createNoise2D(random);

  const style = styleRoll < config.spiralProbability ? "spiral"
    : styleRoll < config.spiralProbability + config.crosshatchProbability ? "crosshatch" : "line";
  // [angle offset, frequency multiplier, relief multiplier, level divisor]
  const plates = style === "crosshatch"
    ? [[0, 1, 1, 1], [72, 0.92, 0.7, 0.55], [-38, 1.13, 0.5, 0.28]]
    : [[0, 1, 1, 1]];

  // Tone: luminance lightly blurred (fine texture would just jitter the lines).
  // When the blur is wide enough it is computed at half resolution and
  // bilinearly upsampled per row (small blurs stay full-res to keep detail).
  const n = width * height;
  const blurR = Math.max(1, Math.round(period * 0.15));
  const ls = blurR >= 4 ? 2 : 1;
  const hw = Math.max(1, Math.floor(width / ls)), hh = Math.max(1, Math.floor(height / ls));
  const level = new Float32Array(hw * hh);
  if (ls === 1) {
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      level[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
    }
  } else {
    for (let y = 0; y < hh; y++) {
      const ya = 2 * y * width, yb = Math.min(height - 1, 2 * y + 1) * width;
      for (let x = 0; x < hw; x++) {
        const xa = 2 * x, xb = Math.min(width - 1, 2 * x + 1);
        const p = (ya + xa) * 4, q = (ya + xb) * 4, r = (yb + xa) * 4, t = (yb + xb) * 4;
        level[y * hw + x] = (0.299 * (imageData[p] + imageData[q] + imageData[r] + imageData[t]) +
          0.587 * (imageData[p + 1] + imageData[q + 1] + imageData[r + 1] + imageData[t + 1]) +
          0.114 * (imageData[p + 2] + imageData[q + 2] + imageData[r + 2] + imageData[t + 2])) / 1020;
      }
    }
  }
  boxBlur(level, hw, hh, Math.max(1, Math.round(blurR / ls)), new Float32Array(hw * hh));
  for (let j = 0; j < hw * hh; j++) {
    const v = 0.5 + (level[j] - 0.5) * contrast;
    level[j] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  // Full-res → level-grid sample positions (pixel centres).
  const lx0 = new Int32Array(width), lx1 = new Int32Array(width), lfx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(hw - 1, (x + 0.5) / ls - 0.5));
    lx0[x] = Math.floor(g); lx1[x] = Math.min(hw - 1, lx0[x] + 1); lfx[x] = g - lx0[x];
  }
  const levelRow = new Float32Array(hw);

  // Low-res phase grids (in cycles), one per plate.
  const { w: gw, h: gh } = fitSize(width, height, GRID_MAX);
  const cellW = width / gw, cellH = height / gh;
  const field = flow && style !== "spiral" ? flowField(imageData, width, height, gw, gh, baseAngle) : null;
  const wobble = waviness * 0.06 * minDim;
  const grids = plates.map(([offset, freq]) => {
    const a = ((baseAngle + offset) * Math.PI) / 180;
    // Lines run along (cos a, sin a); the phase climbs along the normal.
    const nx = -Math.sin(a), ny = Math.cos(a);
    const grid = new Float32Array(gw * gh);
    if (field) integrate(grid, field, gw, gh, cellW, cellH, (offset * Math.PI) / 180, nx, ny);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const px = (gx + 0.5) * cellW, py = (gy + 0.5) * cellH;
        const u = (px / minDim) * 3.1, v = (py / minDim) * 3.1;
        const wob = (noise(u, v) * nx + noise(u + 7.31, v + 3.77) * ny) * wobble;
        const i = gy * gw + gx;
        const base = field ? grid[i] : px * nx + py * ny;
        grid[i] = ((base + wob) / period) * freq;
      }
    }
    return grid;
  });
  // Spiral: only the wobble lives on the grid; r and θ are exact per pixel.
  const spiralWob = new Float32Array(gw * gh);
  if (style === "spiral") {
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const u = ((gx + 0.5) * cellW / minDim) * 3.1, v = ((gy + 0.5) * cellH / minDim) * 3.1;
        spiralWob[gy * gw + gx] = (noise(u, v) * wobble) / period;
      }
    }
  }

  // Bilinear lookup tables (cell centres).
  const x0s = new Int32Array(width), x1s = new Int32Array(width), fxs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(gw - 1, (x + 0.5) / cellW - 0.5));
    x0s[x] = Math.floor(g); x1s[x] = Math.min(gw - 1, x0s[x] + 1); fxs[x] = g - x0s[x];
  }

  const TAU = Math.PI * 2;
  const aa = Math.min(1, Math.max(0.02, TAU / period));
  const reliefScale = relief * 9.42;
  const spiral = style === "spiral";
  const lookup = spiral ? [spiralWob] : grids;
  const P = lookup.length;
  // Per plate: relief in cycles per unit level, and the level divisor.
  const relK = plates.map((p) => (reliefScale * p[2]) / TAU);
  const invLDivs = plates.map((p) => 1 / p[3]);
  // cos over one cycle; the phase is wrapped into it with an integer mask.
  const LUT_BITS = 14, LUT_N = 1 << LUT_BITS, MASK = LUT_N - 1;
  const cosLut = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) cosLut[i] = Math.cos((i / LUT_N) * TAU);
  const OFF = 1 << 30; // keeps (phase·N + OFF) positive before the |0
  const thrA = -1 - 2 * aa, thrB = 2 + 2 * aa, invAA = 1 / (2 * aa);

  // One vertically-interpolated grid row per plate, reused across the row.
  const rows = lookup.map(() => new Float32Array(gw));
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, n);
  const pr = paperRGB[0], pg = paperRGB[1], pb = paperRGB[2];
  const dr = inkRGB[0] - pr, dg = inkRGB[1] - pg, db = inkRGB[2] - pb;
  // Paper→ink colours for 1024 coverage steps (fixed-ink plates).
  const inkLut = new Uint32Array(1024);
  for (let q = 0; q < 1024; q++) {
    const c = q / 1023;
    inkLut[q] = 0xff000000 | (((pb + db * c + 0.5) | 0) << 16) | (((pg + dg * c + 0.5) | 0) << 8) | ((pr + dr * c + 0.5) | 0);
  }
  const lvRow = new Float32Array(width), extraRow = new Float32Array(width), coverRow = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    const g = Math.max(0, Math.min(gh - 1, (y + 0.5) / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let k = 0; k < P; k++) {
      const G = lookup[k], R = rows[k];
      for (let gx = 0; gx < gw; gx++) R[gx] = G[r0 + gx] + (G[r1 + gx] - G[r0 + gx]) * fy;
    }
    const dy = y - cy;
    {
      const g = Math.max(0, Math.min(hh - 1, (y + 0.5) / ls - 0.5));
      const a0 = Math.floor(g) * hw, a1 = Math.min(hh - 1, Math.floor(g) + 1) * hw, f = g - Math.floor(g);
      for (let x = 0; x < hw; x++) levelRow[x] = level[a0 + x] + (level[a1 + x] - level[a0 + x]) * f;
    }
    for (let x = 0; x < width; x++) {
      const la = levelRow[lx0[x]];
      lvRow[x] = la + (levelRow[lx1[x]] - la) * lfx[x];
    }
    if (spiral) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        extraRow[x] = Math.sqrt(dx * dx + dy * dy) / period - fastAtan2(dy, dx) / TAU;
      }
    }
    coverRow.fill(0);
    for (let k = 0; k < P; k++) plateRow(rows[k], relK[k], invLDivs[k]);

    const o = y * width;
    if (colorInk) {
      for (let x = 0, i = o * 4; x < width; x++, i += 4) {
        const cover = coverRow[x];
        const rr = pr + (imageData[i] * 0.55 - pr) * cover;
        const gg = pg + (imageData[i + 1] * 0.55 - pg) * cover;
        const bb = pb + (imageData[i + 2] * 0.55 - pb) * cover;
        out32[o + x] = 0xff000000 | (((bb + 0.5) | 0) << 16) | (((gg + 0.5) | 0) << 8) | ((rr + 0.5) | 0);
      }
    } else {
      for (let x = 0; x < width; x++) out32[o + x] = inkLut[(coverRow[x] * 1023 + 0.5) | 0];
    }
  }

  // Max-composites one plate's ink coverage into coverRow for the current row.
  function plateRow(R, rk, invL) {
    for (let x = 0; x < width; x++) {
      const lv = lvRow[x];
      const l = lv * invL;
      if (l >= 1) continue; // threshold above the wave's peak: bare paper
      const ra = R[x0s[x]];
      const phase = ra + (R[x1s[x]] - ra) * fxs[x] + extraRow[x] + rk * lv;
      const v = cosLut[((phase * LUT_N + OFF) | 0) & MASK];
      // l = 0 → threshold below the wave (solid ink), l = 1 → above it (bare paper).
      const t = (v - thrA - thrB * l) * invAA;
      if (t <= 0) continue;
      const ink = t >= 1 ? 1 : t * t * (3 - 2 * t);
      if (ink > coverRow[x]) coverRow[x] = ink;
    }
  }
}

// atan2 via a minimax polynomial (|error| < 1e-5 rad) — the spiral's angle term.
function fastAtan2(y, x) {
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  if (ax === 0 && ay === 0) return 0;
  const swap = ay > ax;
  const t = swap ? ax / ay : ay / ax;
  const s = t * t;
  let r = ((((-0.0117212 * s + 0.05265332) * s - 0.11643287) * s + 0.19354346) * s - 0.33262347) * s * t + 0.99997726 * t;
  if (swap) r = 1.5707963267948966 - r;
  if (x < 0) r = 3.141592653589793 - r;
  return y < 0 ? -r : r;
}

// Line-normal direction field on the grid: the structure-tensor normal where
// the image has clean edges, relaxing to the base direction elsewhere. Kept in
// doubled-angle form while smoothing, since orientation is only known mod 180°.
function flowField(imageData, width, height, gw, gh, baseAngle) {
  const ds = downsampleLum(imageData, width, height, GRID_MAX);
  const { nx, ny, coherence, strength } = computeOrientationField(ds.lum, ds.w, ds.h, 3);
  const a = (baseAngle * Math.PI) / 180;
  const bx = -Math.sin(a), by = Math.cos(a);
  const c2 = new Float32Array(gw * gh), s2 = new Float32Array(gw * gh);
  const bc = bx * bx - by * by, bs = 2 * bx * by;
  for (let i = 0; i < gw * gh; i++) {
    const wgt = coherence[i] * strength[i];
    c2[i] = (nx[i] * nx[i] - ny[i] * ny[i]) * wgt + bc * 0.1;
    s2[i] = 2 * nx[i] * ny[i] * wgt + bs * 0.1;
  }
  const tmp = new Float32Array(gw * gh);
  for (let pass = 0; pass < 2; pass++) { boxBlur(c2, gw, gh, 4, tmp); boxBlur(s2, gw, gh, 4, tmp); }
  const theta = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) theta[i] = 0.5 * Math.atan2(s2[i], c2[i]);
  return { theta, bx, by };
}

// Block-average luminance (0..255) down to fit maxSize, like downsampleImage,
// but reading every other pixel of every other row — the cells are ~16 px.
function downsampleLum(imageData, width, height, maxSize) {
  const { w, h } = fitSize(width, height, maxSize);
  const n = w * h;
  const sum = new Float32Array(n), count = new Float32Array(n);
  const step = Math.max(width / w, height / h) >= 6 ? 2 : 1;
  const colOf = new Int32Array(width);
  for (let x = 0; x < width; x++) colOf[x] = Math.min(w - 1, Math.floor((x * w) / width));
  for (let y = 0; y < height; y += step) {
    const rowBase = Math.min(h - 1, Math.floor((y * h) / height)) * w;
    for (let x = 0, i = y * width * 4; x < width; x += step, i += 4 * step) {
      const c = rowBase + colOf[x];
      sum[c] += 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
      count[c]++;
    }
  }
  for (let c = 0; c < n; c++) sum[c] = count[c] > 0 ? sum[c] / count[c] : 0;
  return { lum: sum, w, h };
}

// Least-squares integrate a direction field (rotated by `rot`) into a phase
// grid in pixels: SOR on ψ_j − ψ_i ≈ d·(p_j − p_i), seeded with the straight
// ramp. Two-level: 75 sweeps on a half-resolution grid (the same reach as 300
// sweeps on the full grid, at 1/16 the cost), upsampled, then 10 fine sweeps.
function integrate(grid, field, gw, gh, cellW, cellH, rot, nx, ny) {
  const cw = Math.max(1, Math.round(gw / 2)), ch = Math.max(1, Math.round(gh / 2));
  const ccW = (gw * cellW) / cw, ccH = (gh * cellH) / ch;
  if (!field.coarse) {
    // Coarse orientation: doubled-angle average of each 2×2 block.
    const { theta } = field;
    const th = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const ya = Math.floor((y * gh) / ch), yb = Math.max(ya + 1, Math.floor(((y + 1) * gh) / ch));
      for (let x = 0; x < cw; x++) {
        const xa = Math.floor((x * gw) / cw), xb = Math.max(xa + 1, Math.floor(((x + 1) * gw) / cw));
        let c2 = 0, s2 = 0;
        for (let yy = ya; yy < yb; yy++) {
          for (let xx = xa; xx < xb; xx++) { const t = 2 * theta[yy * gw + xx]; c2 += Math.cos(t); s2 += Math.sin(t); }
        }
        th[y * cw + x] = 0.5 * Math.atan2(s2, c2);
      }
    }
    field.coarse = th;
  }
  const cg = rampGrid(cw, ch, ccW, ccH, nx, ny);
  sor(cg, edgeTerms(field.coarse, cw, ch, ccW, ccH, rot, nx, ny), cw, ch, 75);

  // Upsample the coarse residual (phase minus ramp) bilinearly onto the fine grid.
  const fine = new Float64Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const py = (y + 0.5) * cellH;
    const g = Math.max(0, Math.min(ch - 1, py / ccH - 0.5));
    const y0 = Math.floor(g), y1 = Math.min(ch - 1, y0 + 1), fy = g - y0;
    const ry0 = (y0 + 0.5) * ccH * ny, ry1 = (y1 + 0.5) * ccH * ny;
    for (let x = 0; x < gw; x++) {
      const px = (x + 0.5) * cellW;
      const gxf = Math.max(0, Math.min(cw - 1, px / ccW - 0.5));
      const x0 = Math.floor(gxf), x1 = Math.min(cw - 1, x0 + 1), fx = gxf - x0;
      const rx0 = (x0 + 0.5) * ccW * nx, rx1 = (x1 + 0.5) * ccW * nx;
      const top = (cg[y0 * cw + x0] - rx0 - ry0) * (1 - fx) + (cg[y0 * cw + x1] - rx1 - ry0) * fx;
      const bot = (cg[y1 * cw + x0] - rx0 - ry1) * (1 - fx) + (cg[y1 * cw + x1] - rx1 - ry1) * fx;
      fine[y * gw + x] = top + (bot - top) * fy + px * nx + py * ny;
    }
  }
  sor(fine, edgeTerms(field.theta, gw, gh, cellW, cellH, rot, nx, ny), gw, gh, 10);
  grid.set(fine);
}

function rampGrid(gw, gh, cellW, cellH, nx, ny) {
  const g = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) g[gy * gw + gx] = (gx + 0.5) * cellW * nx + (gy + 0.5) * cellH * ny;
  }
  return g;
}

// Edge terms d·(p_j − p_i) for the link to the left / upper neighbour.
function edgeTerms(theta, gw, gh, cellW, cellH, rot, nx, ny) {
  const n = gw * gh;
  const dx = new Float32Array(n), dy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let ux = Math.cos(theta[i] + rot), uy = Math.sin(theta[i] + rot);
    if (ux * nx + uy * ny < 0) { ux = -ux; uy = -uy; } // sign toward the plate's base normal
    dx[i] = ux; dy[i] = uy;
  }
  const ex = new Float64Array(n), ey = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i % gw > 0) ex[i] = (dx[i] + dx[i - 1]) * 0.5 * cellW;
    if (i >= gw) ey[i] = (dy[i] + dy[i - gw]) * 0.5 * cellH;
  }
  return { ex, ey };
}

function sor(grid, { ex, ey }, gw, gh, iters) {
  const omega = 1.85;
  // Interior cells: the four edge terms fold into one constant per cell.
  const c = new Float64Array(gw * gh);
  for (let i = gw; i < gw * (gh - 1); i++) c[i] = ex[i] - ex[i + 1] + ey[i] - ey[i + gw];
  const relax = (i, gx, gy) => {
    let sum = 0, cnt = 0;
    if (gx > 0) { sum += grid[i - 1] + ex[i]; cnt++; }
    if (gx < gw - 1) { sum += grid[i + 1] - ex[i + 1]; cnt++; }
    if (gy > 0) { sum += grid[i - gw] + ey[i]; cnt++; }
    if (gy < gh - 1) { sum += grid[i + gw] - ey[i + gw]; cnt++; }
    if (cnt) grid[i] += omega * (sum / cnt - grid[i]);
  };
  const w4 = omega * 0.25, keep = 1 - omega;
  for (let iter = 0; iter < iters; iter++) {
    for (let gy = 0; gy < gh; gy++) {
      const row = gy * gw;
      if (gy === 0 || gy === gh - 1 || gw < 3) {
        for (let gx = 0; gx < gw; gx++) relax(row + gx, gx, gy);
        continue;
      }
      relax(row, 0, gy);
      for (let i = row + 1, end = row + gw - 1; i < end; i++) {
        grid[i] = keep * grid[i] + w4 * (grid[i - 1] + grid[i + 1] + grid[i - gw] + grid[i + gw] + c[i]);
      }
      relax(row + gw - 1, gw - 1, gy);
    }
  }
}
