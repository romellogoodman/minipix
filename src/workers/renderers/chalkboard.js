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
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    lum[j] = (0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]) / 255;
  }
  boxBlur(lum, width, height, Math.max(1, spacing >> 1), new Float32Array(n));
  // Tone for the hatching: stretched between the 4th and 96th percentiles.
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[Math.min(255, (lum[j] * 255) | 0)]++;
  let lo = 0, hi = 255;
  for (let c = 0, k = 0; k < 256; k++) { c += hist[k]; if (c >= n * 0.04) { lo = k; break; } }
  for (let c = 0, k = 255; k >= 0; k--) { c += hist[k]; if (c >= n * 0.04) { hi = k; break; } }
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
  const x0s = new Int32Array(width), x1s = new Int32Array(width), fxs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(gw - 1, (x + 0.5) / cellW - 0.5));
    x0s[x] = Math.floor(g); x1s[x] = Math.min(gw - 1, x0s[x] + 1); fxs[x] = g - x0s[x];
  }

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
    const L = { ix, ux, uy: 0, row0: new Float64Array(span), row1: new Float64Array(span) };
    L.setRow = (y) => {
      const Y = y * dustScale * ys;
      const iy = Math.floor(Y), fy = Y - iy;
      L.uy = fy * fy * (3 - 2 * fy);
      for (let k = ix[0]; k < span; k++) { L.row0[k] = hash(k, iy); L.row1[k] = hash(k, iy + 1); }
    };
    return L;
  };
  const sample = (L, x) => {
    const k = L.ix[x], ux = L.ux[x], uy = L.uy;
    const a = L.row0[k], b = L.row0[k + 1], c = L.row1[k], d = L.row1[k + 1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
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
  const s = spacing;

  for (let y = 0; y < height; y++) {
    dust1.setRow(y); dust2.setRow(y); lift.setRow(y);
    const ym = (y - s < 0 ? 0 : y - s) * width, y0 = y * width, yp = (y + s >= height ? height - 1 : y + s) * width;
    const g = Math.max(0, Math.min(gh - 1, (y + 0.5) / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let x = 0; x < width; x++) {
      const xm = x - s < 0 ? 0 : x - s, xp = x + s >= width ? width - 1 : x + s;
      const tl = lum[ym + xm], t = lum[ym + x], tr = lum[ym + xp];
      const l = lum[y0 + xm], r = lum[y0 + xp];
      const bl = lum[yp + xm], b = lum[yp + x], br = lum[yp + xp];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      let e = (mag - edgeLow) / (edgeHigh - edgeLow);
      e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);

      const a = x0s[x], c = x1s[x], fx = fxs[x];
      const wt = wobble[r0 + a] + (wobble[r0 + c] - wobble[r0 + a]) * fx;
      const wb = wobble[r1 + a] + (wobble[r1 + c] - wobble[r1 + a]) * fx;
      const wob = wt + (wb - wt) * fy;
      let tone = (lum[y0 + x] - toneLo) * toneScale;
      tone = tone < 0 ? 0 : tone > 1 ? 1 : tone;
      const shade = hatchLights ? tone : 1 - tone;
      let h = 0;
      for (let k = 0; k < 3; k++) {
        const fam = fams[k], sa = fam[0], ca = fam[1], thr = fam[2];
        if (shade < thr) break;
        const ry = (x * sa + y * ca + wob) * invHatch;
        const line = Math.floor(ry);
        const hl = Math.abs(ry - line - 0.5) * 2;
        if (hl >= 0.4) continue;
        const u = hl / 0.4;
        // Each hatch line breaks into separate strokes of varying pressure.
        const seg = vnoise((x * ca - y * sa) * invStroke, line * 1.37 + k * 17.1);
        const press = (seg - 0.32) * 6;
        if (press <= 0) continue;
        const q = (1 - u * u * (3 - 2 * u)) * (press > 1 ? 1 : press) * (0.55 + 0.45 * seg);
        if (q > h) h = q;
      }
      // Rubbed-in chalk haze under the hatching, strongest at the fullest tone.
      const rub = shade > 0.5 ? (shade - 0.5) * 0.7 : 0;
      h = (h > rub ? h : rub) * shading;

      // Chalk only catches the board's high spots: contrasty two-octave dust.
      let dust = (sample(dust1, x) * 0.65 + sample(dust2, x) * 0.35 - grain * 0.45) / (1 - grain * 0.45);
      dust = dust < 0 ? 0 : dust * (1 + grain);
      let m = (e > h ? e : h) * dust;
      m = m > 1 ? 1 : m;

      const st = smear[r0 + a] + (smear[r0 + c] - smear[r0 + a]) * fx;
      const sb = smear[r1 + a] + (smear[r1 + c] - smear[r1 + a]) * fx;
      const boardLift = (st + (sb - st) * fy) * smudge * 0.22 + (sample(lift, x) - 0.5) * 0.04;

      const i = (y0 + x) * 4;
      let cr = CHALK[0], cg = CHALK[1], cb = CHALK[2];
      if (colorChalk) {
        // Pastel sticks: the source colour, saturated and lifted toward white.
        const sr = imageData[i], sg = imageData[i + 1], sb2 = imageData[i + 2];
        const sl = 0.299 * sr + 0.587 * sg + 0.114 * sb2;
        cr = 150 + (sl + (sr - sl) * 1.6) * 0.45;
        cg = 150 + (sl + (sg - sl) * 1.6) * 0.45;
        cb = 150 + (sl + (sb2 - sl) * 1.6) * 0.45;
      }
      const br0 = board[0] + (CHALK[0] - board[0]) * boardLift;
      const bg0 = board[1] + (CHALK[1] - board[1]) * boardLift;
      const bb0 = board[2] + (CHALK[2] - board[2]) * boardLift;
      outputData[i] = br0 + (cr - br0) * m;
      outputData[i + 1] = bg0 + (cg - bg0) * m;
      outputData[i + 2] = bb0 + (cb - bb0) * m;
      outputData[i + 3] = 255;
    }
  }
}
