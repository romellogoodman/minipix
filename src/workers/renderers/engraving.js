import { randFloat, createNoise2D, fitSize, downsampleImage, computeOrientationField, boxBlur } from "../utils.js";

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
  const n = width * height;
  const level = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    level[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
  }
  boxBlur(level, width, height, Math.max(1, Math.round(period * 0.15)), new Float32Array(n));
  for (let j = 0; j < n; j++) {
    const v = 0.5 + (level[j] - 0.5) * contrast;
    level[j] = v < 0 ? 0 : v > 1 ? 1 : v;
  }

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
  const lookup = style === "spiral" ? [spiralWob] : grids;
  const spiral = style === "spiral";

  for (let y = 0; y < height; y++) {
    const g = Math.max(0, Math.min(gh - 1, (y + 0.5) / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const lv = level[j];
      const a = x0s[x], b = x1s[x], fx = fxs[x];
      let cover = 0;
      for (let k = 0; k < lookup.length; k++) {
        const G = lookup[k];
        const top = G[r0 + a] + (G[r0 + b] - G[r0 + a]) * fx;
        const bot = G[r1 + a] + (G[r1 + b] - G[r1 + a]) * fx;
        let cycles = top + (bot - top) * fy;
        if (spiral) {
          const dx = x - cx, dy = y - cy;
          cycles += Math.sqrt(dx * dx + dy * dy) / period - Math.atan2(dy, dx) / TAU;
        }
        const plate = plates[k], rMul = plate[2], lDiv = plate[3];
        const l = lDiv === 1 ? lv : Math.min(1, lv / lDiv);
        const v = Math.cos(cycles * TAU + reliefScale * rMul * lv);
        // l = 0 → threshold below the wave (solid ink), l = 1 → above it (bare paper).
        const thr = -1 - aa + (2 + 2 * aa) * l;
        const t = (v - thr + aa) / (2 * aa);
        const ink = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        if (ink > cover) cover = ink;
      }

      const i = j * 4;
      let ir = inkRGB[0], ig = inkRGB[1], ib = inkRGB[2];
      if (colorInk) { ir = imageData[i] * 0.55; ig = imageData[i + 1] * 0.55; ib = imageData[i + 2] * 0.55; }
      outputData[i] = paperRGB[0] + (ir - paperRGB[0]) * cover;
      outputData[i + 1] = paperRGB[1] + (ig - paperRGB[1]) * cover;
      outputData[i + 2] = paperRGB[2] + (ib - paperRGB[2]) * cover;
      outputData[i + 3] = 255;
    }
  }
}

// Line-normal direction field on the grid: the structure-tensor normal where
// the image has clean edges, relaxing to the base direction elsewhere. Kept in
// doubled-angle form while smoothing, since orientation is only known mod 180°.
function flowField(imageData, width, height, gw, gh, baseAngle) {
  const ds = downsampleImage(imageData, width, height, GRID_MAX);
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

// Least-squares integrate a direction field (rotated by `rot`) into a phase
// grid in pixels: SOR on ψ_j − ψ_i ≈ d·(p_j − p_i), seeded with the straight ramp.
function integrate(grid, { theta }, gw, gh, cellW, cellH, rot, nx, ny) {
  const n = gw * gh;
  const dx = new Float32Array(n), dy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let ux = Math.cos(theta[i] + rot), uy = Math.sin(theta[i] + rot);
    if (ux * nx + uy * ny < 0) { ux = -ux; uy = -uy; } // sign toward the plate's base normal
    dx[i] = ux; dy[i] = uy;
  }
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) grid[gy * gw + gx] = (gx + 0.5) * cellW * nx + (gy + 0.5) * cellH * ny;
  }
  // Edge terms d·(p_j − p_i) for the link to the left / upper neighbour.
  const ex = new Float64Array(n), ey = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i % gw > 0) ex[i] = (dx[i] + dx[i - 1]) * 0.5 * cellW;
    if (i >= gw) ey[i] = (dy[i] + dy[i - gw]) * 0.5 * cellH;
  }
  const omega = 1.85;
  const relax = (i, gx, gy) => {
    let sum = 0, cnt = 0;
    if (gx > 0) { sum += grid[i - 1] + ex[i]; cnt++; }
    if (gx < gw - 1) { sum += grid[i + 1] - ex[i + 1]; cnt++; }
    if (gy > 0) { sum += grid[i - gw] + ey[i]; cnt++; }
    if (gy < gh - 1) { sum += grid[i + gw] - ey[i + gw]; cnt++; }
    grid[i] += omega * (sum / cnt - grid[i]);
  };
  for (let iter = 0; iter < 300; iter++) {
    for (let gy = 0; gy < gh; gy++) {
      const row = gy * gw;
      if (gy === 0 || gy === gh - 1 || gw < 3) {
        for (let gx = 0; gx < gw; gx++) relax(row + gx, gx, gy);
        continue;
      }
      relax(row, 0, gy);
      for (let i = row + 1, end = row + gw - 1; i < end; i++) {
        const sum = grid[i - 1] + ex[i] + (grid[i + 1] - ex[i + 1]) + (grid[i - gw] + ey[i]) + (grid[i + gw] - ey[i + gw]);
        grid[i] += omega * (sum / 4 - grid[i]);
      }
      relax(row + gw - 1, gw - 1, gy);
    }
  }
}
