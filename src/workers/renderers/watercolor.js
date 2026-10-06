import { randFloat, createNoise2D, fitSize, boxBlur } from "../utils.js";

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
  const ds = downsampleRGB(imageData, width, height, WORK_MAX);
  const { w, h } = ds;
  const radius = Math.max(2, Math.round(Math.min(w, h) * radiusPct));
  const flat = kuwahara(ds.r, ds.g, ds.b, w, h, radius);

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
    // Separable Sobel: vertical [1 2 1] sums / [−1 0 1] differences, then across.
    const vSum = new Float32Array(width), vDif = new Float32Array(width);
    for (let y = 0; y < height; y++) {
      const ym = Math.max(0, y - s) * width, y0 = y * width, yp = Math.min(height - 1, y + s) * width;
      for (let x = 0; x < width; x++) {
        const t = lum[ym + x], b = lum[yp + x];
        vSum[x] = t + 2 * lum[y0 + x] + b;
        vDif[x] = b - t;
      }
      for (let x = 0; x < width; x++) {
        const xm = x - s < 0 ? 0 : x - s, xp = x + s > width - 1 ? width - 1 : x + s;
        const gx = vSum[xp] - vSum[xm];
        const gy = vDif[xm] + 2 * vDif[x] + vDif[xp];
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
  const grainScale = 1 / Math.max(1.2, minDim / 900);
  // The grain is sampled on an axis-aligned grid (x * grainScale * xs + xo), so its per-column
  // lattice terms and the per-row hash values are tabulated; the blend is unchanged.
  const lattice = (xs, xo) => {
    const ix = new Int32Array(width), ux = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      const X = x * grainScale * xs + xo;
      ix[x] = Math.floor(X);
      const f = X - ix[x];
      ux[x] = f * f * (3 - 2 * f);
    }
    const span = ix[width - 1] + 2;
    const L = { ix, ux, iy: NaN, row0: new Float64Array(span), row1: new Float64Array(span), col: new Float64Array(span) };
    // Per row: refresh the cached lattice rows (reusing row1 when stepping down
    // one cell), then blend them vertically so each pixel is a 1-D lerp.
    L.setRow = (y) => {
      const Y = y * grainScale * xs;
      const iy = Math.floor(Y), fy = Y - iy;
      const uy = fy * fy * (3 - 2 * fy);
      if (iy !== L.iy) {
        if (iy === L.iy + 1) {
          const t = L.row0; L.row0 = L.row1; L.row1 = t;
          for (let k = ix[0]; k < span; k++) L.row1[k] = hash(k, iy + 1);
        } else {
          for (let k = ix[0]; k < span; k++) { L.row0[k] = hash(k, iy); L.row1[k] = hash(k, iy + 1); }
        }
        L.iy = iy;
      }
      const r0 = L.row0, r1 = L.row1, col = L.col;
      for (let k = ix[0]; k < span; k++) col[k] = r0[k] + (r1[k] - r0[k]) * uy;
    };
    return L;
  };
  const fine = lattice(1, 0), coarse = lattice(0.31, 17);
  const sx = w / width, sy = h / height;
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const wxRow = new Float32Array(gw), wyRow = new Float32Array(gw), washRow = new Float32Array(gw);
  const fIx = fine.ix, fUx = fine.ux, cIx = coarse.ix, cUx = coarse.ux;
  const p0 = paper[0], p1 = paper[1], p2 = paper[2];
  const grainRow = new Float32Array(width), washs = new Float32Array(width);
  const pShift = width / w >= 2 ? 1 : 0, pStep = 1 << pShift;
  const half = (width + 1) >> pShift;
  const pR = new Float32Array(half), pG = new Float32Array(half), pB = new Float32Array(half);

  for (let y = 0; y < height; y++) {
    fine.setRow(y); coarse.setRow(y);
    const g = Math.max(0, Math.min(gh - 1, (y + 0.5) / cellH - 0.5));
    const r0 = Math.floor(g) * gw, r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw, fy = g - Math.floor(g);
    for (let q = 0; q < gw; q++) {
      wxRow[q] = wobX[r0 + q] + (wobX[r1 + q] - wobX[r0 + q]) * fy;
      wyRow[q] = wobY[r0 + q] + (wobY[r1 + q] - wobY[r0 + q]) * fy;
      washRow[q] = wash[r0 + q] + (wash[r1 + q] - wash[r0 + q]) * fy;
    }
    row(y, fine.col, coarse.col);
  }

  function row(y, fv, cv) {
    const yo = y * width;
    // Paper grain and wash strength per column.
    for (let x = 0; x < width; x++) {
      const kf = fIx[x], kc = cIx[x];
      grainRow[x] = (fv[kf] + (fv[kf + 1] - fv[kf]) * fUx[x]) * 0.4 + (cv[kc] + (cv[kc + 1] - cv[kc]) * cUx[x]) * 0.6;
      const a = x0s[x], wa = washRow[a];
      washs[x] = wa + (washRow[x1s[x]] - wa) * fxs[x];
    }
    // Pigment at the wobbled position, sampled once per horizontal pixel pair
    // when the pigment field is ≥ 2× magnified (pairs then share a value).
    const yc = y + 0.5;
    for (let X = 0, x = 0; x < width; X++, x += pStep) {
      const a = x0s[x], b = x1s[x], fx = fxs[x];
      const xc = pStep === 2 && x + 1 < width ? x + 1 : x + 0.5;
      const wxa = wxRow[a], wya = wyRow[a];
      let wx = (xc + wxa + (wxRow[b] - wxa) * fx) * sx - 0.5, wy = (yc + wya + (wyRow[b] - wya) * fx) * sy - 0.5;
      wx = wx < 0 ? 0 : wx > w - 1 ? w - 1 : wx;
      wy = wy < 0 ? 0 : wy > h - 1 ? h - 1 : wy;
      let ix = wx | 0, iy = wy | 0;
      if (ix > w - 2) ix = w - 2;
      if (iy > h - 2) iy = h - 2;
      const tx = wx - ix, ty = wy - iy;
      const p00 = (iy * w + ix) * 3, p10 = p00 + 3, p01 = p00 + w * 3, p11 = p01 + 3;
      let t = pig[p00] + (pig[p10] - pig[p00]) * tx, u = pig[p01] + (pig[p11] - pig[p01]) * tx;
      pR[X] = t + (u - t) * ty;
      t = pig[p00 + 1] + (pig[p10 + 1] - pig[p00 + 1]) * tx; u = pig[p01 + 1] + (pig[p11 + 1] - pig[p01 + 1]) * tx;
      pG[X] = t + (u - t) * ty;
      t = pig[p00 + 2] + (pig[p10 + 2] - pig[p00 + 2]) * tx; u = pig[p01 + 2] + (pig[p11 + 2] - pig[p01 + 2]) * tx;
      pB[X] = t + (u - t) * ty;
    }
    for (let x = 0; x < width; x++) {
      // Paper grain: pigment settles into the valleys.
      const grain = grainRow[x];
      const settle = (1 + (0.5 - grain) * 2 * granulation) * washs[x];
      const tooth = 1 - (0.5 - grain) * 0.06;
      const X = x >> pShift;
      let pr = pR[X] * settle, pg = pG[X] * settle, pb = pB[X] * settle;
      pr = pr < 0 ? 0 : pr > 1 ? 1 : pr;
      pg = pg < 0 ? 0 : pg > 1 ? 1 : pg;
      pb = pb < 0 ? 0 : pb > 1 ? 1 : pb;
      let vr = p0 * (1 - pr) * tooth, vg = p1 * (1 - pg) * tooth, vb = p2 * (1 - pb) * tooth;
      if (pen !== null) {
        const ink = (pen[yo + x] / 255) * (grain > 0.3 ? 1 : 0.4) * 0.85;
        vr += (INK[0] - vr) * ink; vg += (INK[1] - vg) * ink; vb += (INK[2] - vb) * ink;
      }
      out32[yo + x] = 0xff000000 | (clamp8(vb) << 16) | (clamp8(vg) << 8) | clamp8(vr);
    }
  }
}

// Uint8ClampedArray store semantics (round, clamp) for a packed write.
function clamp8(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}

// Block-average RGB down to fit maxSize (like downsampleImage, without the
// luminance plane); large blocks read every other pixel of every other row.
function downsampleRGB(imageData, width, height, maxSize) {
  const { w, h } = fitSize(width, height, maxSize);
  const n = w * h;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), count = new Float32Array(n);
  const step = Math.min(width / w, height / h) >= 3 ? 2 : 1;
  const colOf = new Int32Array(width);
  for (let x = 0; x < width; x++) colOf[x] = Math.min(w - 1, Math.floor((x * w) / width));
  for (let y = 0; y < height; y += step) {
    const rowBase = Math.min(h - 1, Math.floor((y * h) / height)) * w;
    for (let x = 0, i = y * width * 4; x < width; x += step, i += 4 * step) {
      const c = rowBase + colOf[x];
      r[c] += imageData[i]; g[c] += imageData[i + 1]; b[c] += imageData[i + 2];
      count[c]++;
    }
  }
  for (let c = 0; c < n; c++) {
    const inv = count[c] > 0 ? 1 / count[c] : 0;
    r[c] *= inv; g[c] *= inv; b[c] *= inv;
  }
  return { r, g, b, w, h };
}

// Kuwahara over RGB planes. Each quadrant's mean and variance comes from
// running sums of R, G, B and R² + G² + B² (only the summed variance is
// compared): per-column sums over the rows above (colTop, rows y-radius..y)
// and below (colBot, rows y..y+radius) slide down one row at a time, and their
// per-row prefix sums give any column span in 2 lookups. Returns interleaved
// RGB means (0..255).
function kuwahara(R, G, B, w, h, radius) {
  const colTop = new Float64Array(w * 4), colBot = new Float64Array(w * 4);
  // The top span of row y (rows y-radius..y) is the bottom span of row
  // y-radius, so bottom prefix rows are kept in a ring and reused; only the
  // first rows (whose top span is clipped) need their own top sums.
  const ring = Array.from({ length: radius + 1 }, () => new Float64Array((w + 1) * 4));
  const preClip = new Float64Array((w + 1) * 4);
  const addRow = (col, y, sign) => {
    for (let x = 0, si = y * w, ci = 0; x < w; x++, si++, ci += 4) {
      const r = R[si], g = G[si], b = B[si];
      col[ci] += sign * r; col[ci + 1] += sign * g; col[ci + 2] += sign * b;
      col[ci + 3] += sign * (r * r + g * g + b * b);
    }
  };
  const prefix = (col, pre) => {
    for (let ci = 0; ci < w * 4; ci++) pre[ci + 4] = pre[ci] + col[ci];
  };
  for (let y = 0; y <= Math.min(h - 1, radius); y++) addRow(colBot, y, 1);
  const invN = new Float64Array((radius + 1) * (radius + 1) + 1);
  for (let n = 1; n < invN.length; n++) invN[n] = 1 / n;

  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - radius), yb = Math.min(h - 1, y + radius);
    if (y > 0) {
      addRow(colBot, y - 1, -1);
      if (y + radius < h) addRow(colBot, y + radius, 1);
    }
    const preBot = ring[y % (radius + 1)];
    prefix(colBot, preBot);
    let preTop;
    if (y >= radius) {
      preTop = ring[(y - radius) % (radius + 1)];
    } else {
      addRow(colTop, y, 1);
      prefix(colTop, preClip);
      preTop = preClip;
    }
    const rowsTop = y - ya + 1, rowsBot = yb - y + 1;

    for (let x = 0; x < w; x++) {
      const xa = x - radius < 0 ? 0 : x - radius, xb = x + radius > w - 1 ? w - 1 : x + radius;
      // Column spans: left = xa..x, right = x..xb (both include the centre).
      const la = (x + 1) * 4, lc = xa * 4, ra = (xb + 1) * 4, rc = x * 4;
      const nl = x - xa + 1, nr = xb - x + 1;
      // Quadrants in order: top-left, top-right, bottom-left, bottom-right
      // (ties keep the earlier one).
      let inv = invN[nl * rowsTop];
      let mr = (preTop[la] - preTop[lc]) * inv, mg = (preTop[la + 1] - preTop[lc + 1]) * inv, mb = (preTop[la + 2] - preTop[lc + 2]) * inv;
      let best = (preTop[la + 3] - preTop[lc + 3]) * inv - mr * mr - mg * mg - mb * mb;
      let bmr = mr, bmg = mg, bmb = mb, v;
      inv = invN[nr * rowsTop];
      mr = (preTop[ra] - preTop[rc]) * inv; mg = (preTop[ra + 1] - preTop[rc + 1]) * inv; mb = (preTop[ra + 2] - preTop[rc + 2]) * inv;
      v = (preTop[ra + 3] - preTop[rc + 3]) * inv - mr * mr - mg * mg - mb * mb;
      if (v < best) { best = v; bmr = mr; bmg = mg; bmb = mb; }
      inv = invN[nl * rowsBot];
      mr = (preBot[la] - preBot[lc]) * inv; mg = (preBot[la + 1] - preBot[lc + 1]) * inv; mb = (preBot[la + 2] - preBot[lc + 2]) * inv;
      v = (preBot[la + 3] - preBot[lc + 3]) * inv - mr * mr - mg * mg - mb * mb;
      if (v < best) { best = v; bmr = mr; bmg = mg; bmb = mb; }
      inv = invN[nr * rowsBot];
      mr = (preBot[ra] - preBot[rc]) * inv; mg = (preBot[ra + 1] - preBot[rc + 1]) * inv; mb = (preBot[ra + 2] - preBot[rc + 2]) * inv;
      v = (preBot[ra + 3] - preBot[rc + 3]) * inv - mr * mr - mg * mg - mb * mb;
      if (v < best) { bmr = mr; bmg = mg; bmb = mb; }
      const o = (y * w + x) * 3;
      out[o] = bmr; out[o + 1] = bmg; out[o + 2] = bmb;
    }
  }
  return out;
}
