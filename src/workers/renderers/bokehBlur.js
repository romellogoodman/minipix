import { randFloat, randInt } from "../utils.js";

const WORK_MAX = 800;
const MAX_WORK_RADIUS = 18;
const HIGHLIGHT_KNEE = 0.35;

// Cubic B-spline weights and taps for resampling n source samples to m
// outputs: per output, a base index and four weights.
function splineTaps(n, m, scale) {
  const idx = new Int32Array(m * 4);
  const wts = new Float32Array(m * 4);
  for (let i = 0; i < m; i++) {
    const f = (i + 0.5) / scale - 0.5;
    const b = Math.floor(f);
    const t = f - b;
    const t2 = t * t, t3 = t2 * t;
    wts[i * 4] = (1 - 3 * t + 3 * t2 - t3) / 6;
    wts[i * 4 + 1] = (3 * t3 - 6 * t2 + 4) / 6;
    wts[i * 4 + 2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
    wts[i * 4 + 3] = t3 / 6;
    for (let k = 0; k < 4; k++) {
      const j = b - 1 + k;
      idx[i * 4 + k] = j < 0 ? 0 : j >= n ? n - 1 : j;
    }
  }
  return { idx, wts };
}
const NOVEL_SHAPES = ["star", "heart", "ring", "cross"];

// Aperture membership in unit space (screen coords, y down); everything fits
// inside the unit disc.
function makeAperture(shape, blades) {
  switch (shape) {
    case "star": {
      // Star polygon: tips at r = 1, valleys at r = 0.45.
      const half = Math.PI / blades;
      const p2x = 0.45 * Math.cos(half), p2y = 0.45 * Math.sin(half);
      const ex = p2x - 1, ey = p2y;
      return (x, y) => {
        const r = Math.hypot(x, y);
        if (r === 0) return true;
        // Tips point up: angle measured from screen-up, folded into one wedge.
        let a = Math.atan2(x, -y);
        a = Math.abs(a - 2 * half * Math.round(a / (2 * half)));
        const dx = Math.cos(a), dy = Math.sin(a);
        // Ray / edge intersection distance.
        const t = (1 * ey - 0 * ex) / (dx * ey - dy * ex);
        return r <= t;
      };
    }
    case "heart":
      return (x, y) => {
        const hx = x * 1.25, hy = -y * 1.25 + 0.15;
        const q = hx * hx + hy * hy - 1;
        return q * q * q - hx * hx * hy * hy * hy <= 0;
      };
    case "ring":
      return (x, y) => {
        const r2 = x * x + y * y;
        return r2 <= 1 && r2 >= 0.36;
      };
    case "cross":
      return (x, y) => {
        const ax = Math.abs(x) * 1.3, ay = Math.abs(y) * 1.3;
        return Math.max(ax, ay) <= 1 && Math.min(ax, ay) <= 0.33;
      };
    default: {
      if (blades >= 9) return (x, y) => x * x + y * y <= 1;
      // Regular polygon inscribed in the unit circle.
      const seg = (Math.PI * 2) / blades;
      const apothem = Math.cos(seg / 2);
      return (x, y) => {
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        const m = a - seg * Math.floor(a / seg + 0.5);
        return r * Math.cos(m) <= apothem;
      };
    }
  }
}

// Separable [1 2 1] / 4 smoothing in place (clamped edges).
function smooth121(buf, tmp, w, h) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const l = buf[row + (x > 0 ? x - 1 : 0)];
      const r = buf[row + (x < w - 1 ? x + 1 : x)];
      tmp[row + x] = (l + 2 * buf[row + x] + r) * 0.25;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) buf[row + x] = (tmp[up + x] + 2 * tmp[row + x] + tmp[dn + x]) * 0.25;
  }
}

// Rasterize the (rotated, point-reflected) aperture at a pixel radius into
// per-row runs: [dy, x0, x1, ...]. Gathering over -A makes a bright point
// spread into A, so discs appear the right way up.
function apertureSpans(inside, radius, cos, sin) {
  const R = Math.ceil(radius);
  const spans = [];
  for (let dy = -R; dy <= R; dy++) {
    let start = null;
    for (let dx = -R; dx <= R + 1; dx++) {
      let hit = false;
      if (dx <= R) {
        const ux = -dx / radius, uy = -dy / radius;
        // Undo the aperture rotation.
        hit = inside(ux * cos + uy * sin, -ux * sin + uy * cos);
      }
      if (hit && start === null) start = dx;
      else if (!hit && start !== null) {
        spans.push(dy, start, dx - 1);
        start = null;
      }
    }
  }
  return { spans: Int32Array.from(spans), R };
}

// Tent (bilinear splat) downsample into linear light, done separably: each
// source row is splatted horizontally into a row of cells, which is then
// split between its two target rows. Cell weights are separable too.
function downsampleLinear(imageData, width, height, block, ww, wh) {
  const toLinear = new Float32Array(256);
  for (let i = 0; i < 256; i++) toLinear[i] = Math.pow(i / 255, 2.2);
  const src =
    imageData.byteOffset % 4 === 0
      ? new Uint32Array(imageData.buffer, imageData.byteOffset, width * height)
      : new Uint32Array(imageData.slice().buffer);
  const wn = ww * wh;
  const lin = [new Float32Array(wn), new Float32Array(wn), new Float32Array(wn)];
  const [lin0, lin1, lin2] = lin;
  const maxWX = ww - 1;
  const maxWY = wh - 1;
  const colX0 = new Int32Array(width);
  const colTX = new Float64Array(width);
  const cntX = new Float64Array(ww + 1);
  const cntY = new Float64Array(wh + 1);
  for (let x = 0; x < width; x++) {
    let fx = (x + 0.5) / block - 0.5;
    fx = fx < 0 ? 0 : fx;
    const x0 = fx | 0;
    colX0[x] = x0;
    colTX[x] = fx - x0;
    cntX[x0] += 1 - colTX[x];
    cntX[x0 < maxWX ? x0 + 1 : x0] += colTX[x];
  }
  // Row accumulators carry one spare cell so x0 + 1 never needs a check;
  // the spare is folded back into the last cell.
  const rR = new Float64Array(ww + 1), rG = new Float64Array(ww + 1), rB = new Float64Array(ww + 1);
  for (let y = 0; y < height; y++) {
    let fy = (y + 0.5) / block - 0.5;
    fy = fy < 0 ? 0 : fy;
    const y0 = fy | 0;
    const y1 = y0 < maxWY ? y0 + 1 : y0;
    const ty = fy - y0;
    cntY[y0] += 1 - ty;
    cntY[y1] += ty;
    // Consecutive pixels share their two cells: accumulate in locals and
    // flush when the cell changes.
    let cur = 0;
    let aR = 0, aG = 0, aB = 0, bR = 0, bG = 0, bB = 0;
    for (let x = 0, q = y * width; x < width; x++, q++) {
      const x0 = colX0[x];
      if (x0 !== cur) {
        rR[cur] = aR; rG[cur] = aG; rB[cur] = aB;
        if (x0 === cur + 1) {
          aR = bR; aG = bG; aB = bB;
        } else {
          rR[cur + 1] = bR; rG[cur + 1] = bG; rB[cur + 1] = bB;
          aR = aG = aB = 0;
        }
        bR = bG = bB = 0;
        cur = x0;
      }
      const v = src[q];
      const r = toLinear[v & 255], g = toLinear[(v >>> 8) & 255], b = toLinear[(v >>> 16) & 255];
      const tx = colTX[x], ux = 1 - tx;
      aR += r * ux; aG += g * ux; aB += b * ux;
      bR += r * tx; bG += g * tx; bB += b * tx;
    }
    rR[cur] = aR; rG[cur] = aG; rB[cur] = aB;
    rR[cur + 1] = bR; rG[cur + 1] = bG; rB[cur + 1] = bB;
    rR[maxWX] += rR[ww]; rG[maxWX] += rG[ww]; rB[maxWX] += rB[ww];
    rR[ww] = rG[ww] = rB[ww] = 0;
    const a = y0 * ww, c = y1 * ww, uy = 1 - ty;
    for (let x = 0; x < ww; x++) {
      lin0[a + x] += rR[x] * uy; lin1[a + x] += rG[x] * uy; lin2[a + x] += rB[x] * uy;
      lin0[c + x] += rR[x] * ty; lin1[c + x] += rG[x] * ty; lin2[c + x] += rB[x] * ty;
    }
  }
  for (let y = 0, i = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++, i++) {
      const inv = 1 / (cntX[x] * cntY[y]);
      lin0[i] *= inv;
      lin1[i] *= inv;
      lin2[i] *= inv;
    }
  }
  return lin;
}

const ENC_N = 4096;

function encodeLUT(encode, v) {
  const f = Math.sqrt(v > 1 ? 1 : v) * ENC_N;
  const i = f | 0;
  return encode[i] + (encode[i + 1] - encode[i]) * (f - i);
}

function gatherChannel(spans, Pc, PW, outC, ww, wh, pad, stride, encode) {
  const accC = new Float64Array(ww);
  const accW = new Float64Array(ww);
  const n = spans.length;
  for (let y = 0; y < wh; y++) {
    accC.fill(0);
    accW.fill(0);
    for (let s = 0; s < n; s += 3) {
      const row = (y + pad + spans[s]) * stride + pad;
      const a = row + spans[s + 1];
      const b = row + spans[s + 2] + 1;
      for (let x = 0; x < ww; x++) {
        accC[x] += Pc[b + x] - Pc[a + x];
        accW[x] += PW[b + x] - PW[a + x];
      }
    }
    const o = y * ww;
    for (let x = 0; x < ww; x++) outC[o + x] = encodeLUT(encode, accC[x] / accW[x]);
  }
}

function gatherShared(spans, P, PW, out, ww, wh, pad, stride, encode) {
  const [P0, P1, P2] = P;
  const [o0, o1, o2] = out;
  const acc0 = new Float64Array(ww), acc1 = new Float64Array(ww), acc2 = new Float64Array(ww);
  const accW = new Float64Array(ww);
  const n = spans.length;
  for (let y = 0; y < wh; y++) {
    acc0.fill(0); acc1.fill(0); acc2.fill(0);
    accW.fill(0);
    for (let s = 0; s < n; s += 3) {
      const row = (y + pad + spans[s]) * stride + pad;
      const a = row + spans[s + 1];
      const b = row + spans[s + 2] + 1;
      for (let x = 0; x < ww; x++) {
        acc0[x] += P0[b + x] - P0[a + x];
        acc1[x] += P1[b + x] - P1[a + x];
        acc2[x] += P2[b + x] - P2[a + x];
        accW[x] += PW[b + x] - PW[a + x];
      }
    }
    const o = y * ww;
    for (let x = 0; x < ww; x++) {
      const iw = 1 / accW[x];
      o0[o + x] = encodeLUT(encode, acc0[x] * iw);
      o1[o + x] = encodeLUT(encode, acc1[x] * iw);
      o2[o + x] = encodeLUT(encode, acc2[x] * iw);
    }
  }
}

/**
 * Photographic lens blur (after BokehBlur): the image is defocused through
 * an aperture-shaped kernel — a bladed iris, a circle, or a novelty cut-out
 * — with bright pixels weighted up so highlights bloom into crisp discs.
 * The gather runs in linear light on a downsampled, edge-padded buffer, and
 * because the aperture is rasterized into row runs each kernel row costs one
 * prefix-sum lookup instead of one tap per pixel. Optional chromatic fringe
 * scales the red and blue apertures apart.
 */
export default function bokehBlur({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const radiusFull = shortSide * randFloat(config.radiusPercent, random);
  const gain = randFloat(config.highlightGain, random);
  const percentile = randFloat(config.highlightPercentile, random);
  const blades = randInt(config.bladeCount, random);
  const novel = random() < config.novelShapeProbability;
  const novelShape = NOVEL_SHAPES[Math.floor(random() * NOVEL_SHAPES.length)];
  const rotation = random() * Math.PI * 2;
  const useFringe = random() < config.fringeProbability;
  const fringe = useFringe ? randFloat(config.fringe, random) : 0;

  // The work grid is at most WORK_MAX px across, and coarse enough that the
  // aperture spans at most ~2·MAX_WORK_RADIUS cells (gather cost grows with
  // the radius; a disc that large is smooth at that sampling anyway).
  const block = Math.max(1, Math.ceil(Math.max(width, height) / WORK_MAX), Math.ceil(radiusFull / MAX_WORK_RADIUS));
  const ww = Math.ceil(width / block);
  const wh = Math.ceil(height / block);
  const radius = Math.max(1, radiusFull / block);
  const inside = makeAperture(novel ? novelShape : "blades", blades);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  // Red samples slightly outward, blue inward (lens dispersion).
  const kernels = [1 + fringe * 0.5, 1, 1 - fringe * 0.5].map((s) =>
    apertureSpans(inside, Math.max(1, radius * s), cos, sin)
  );
  const pad = Math.max(...kernels.map((k) => k.R)) + 1;

  // Downsample in linear light with a tent (bilinear splat) filter; a plain
  // box average lets JPEG block edges alias into a visible lattice that the
  // flat aperture doesn't smooth away.
  const wn = ww * wh;
  const lin = downsampleLinear(imageData, width, height, block, ww, wh);
  // Soften slightly first: a flat aperture keeps the kinks of hard edges
  // (JPEG block seams show up as a lattice), a real lens doesn't.
  const tmp = new Float32Array(wn);
  for (const plane of lin) for (let k = 0; k < 2; k++) smooth121(plane, tmp, ww, wh);

  // Highlights are the brightest `percentile` of the image (perceptual
  // luminance), so every image gets some discs.
  // Encode to sRGB through a LUT indexed by sqrt(linear): x^(1/2.2) is
  // nearly linear in sqrt(x), so interpolation is accurate even in shadows.
  const encode = new Float32Array(ENC_N + 2);
  for (let i = 0; i <= ENC_N; i++) encode[i] = Math.pow(i / ENC_N, 2 / 2.2) * 255;
  encode[ENC_N + 1] = encode[ENC_N];
  const lumOf = new Float32Array(wn);
  const hist = new Uint32Array(256);
  const [l0, l1, l2] = lin;
  for (let i = 0; i < wn; i++) {
    const l = encodeLUT(encode, 0.2126 * l0[i] + 0.7152 * l1[i] + 0.0722 * l2[i]) / 255;
    lumOf[i] = l;
    hist[Math.min(255, (l * 256) | 0)]++;
  }
  let bin = 0;
  for (let acc = 0; bin < 255 && acc + hist[bin] < wn * percentile; bin++) acc += hist[bin];
  const threshold = bin / 256;
  const knee = Math.max(0.04, Math.min(HIGHLIGHT_KNEE, 1 - threshold));

  // Edge-padded, highlight-weighted row prefix sums: P[c] holds Σ w·colour,
  // PW holds Σ w. Each row has pw + 1 entries (leading zero).
  const pw = ww + pad * 2;
  const ph = wh + pad * 2;
  const stride = pw + 1;
  const P = [0, 1, 2].map(() => new Float64Array(stride * ph));
  const PW = new Float64Array(stride * ph);
  for (let py = 0; py < ph; py++) {
    let sy = py - pad;
    sy = sy < 0 ? 0 : sy >= wh ? wh - 1 : sy;
    let sr = 0, sg = 0, sb = 0, sw = 0;
    const row = py * stride;
    for (let px = 0; px < pw; px++) {
      let sx = px - pad;
      sx = sx < 0 ? 0 : sx >= ww ? ww - 1 : sx;
      const wi = sy * ww + sx;
      const r = lin[0][wi], g = lin[1][wi], b = lin[2][wi];
      // Soft-knee highlight boost, as in the shader.
      let t = (lumOf[wi] - threshold) / knee;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = t * t * (3 - 2 * t);
      const w = 1 + gain * t * t;
      sr += r * w;
      sg += g * w;
      sb += b * w;
      sw += w;
      P[0][row + px + 1] = sr;
      P[1][row + px + 1] = sg;
      P[2][row + px + 1] = sb;
      PW[row + px + 1] = sw;
    }
  }

  // Gather: each channel sums its own aperture's runs (one shared pass when
  // there is no fringe). Runs are the outer loop so a whole output row
  // accumulates with sequential reads.
  const out = [new Float32Array(wn), new Float32Array(wn), new Float32Array(wn)];
  if (fringe === 0) gatherShared(kernels[1].spans, P, PW, out, ww, wh, pad, stride, encode);
  else for (let c = 0; c < 3; c++) gatherChannel(kernels[c].spans, P[c], PW, out[c], ww, wh, pad, stride, encode);

  // Separable cubic B-spline upsample (bilinear leaves visible Mach bands
  // at the work-grid knots once the image is this smooth).
  upsample(out, ww, wh, width, height, outputData);
}

const M = 0x00ff00ff;

// Bilinear step on packed RGB words (red and blue share one multiply in
// 16-bit lanes), 8-bit weight f in 0-256, rounded.
const lerp = (p, q, f) => {
  const g = 256 - f;
  const rb = (((p & M) * g + (q & M) * f + 0x00800080) >>> 8) & M;
  const gg = (((p >>> 8) & 0xff) * g + ((q >>> 8) & 0xff) * f + 0x80) & 0xff00;
  return rb | gg;
};

// Upsample in two steps: a separable cubic B-spline to twice the work grid
// (bilinear straight from the work grid leaves visible Mach bands at its
// knots), packed to RGB words, then a cheap packed bilinear to full size.
function upsample(out, ww, wh, width, height, outputData) {
  const mw = Math.min(width, ww * 2);
  const mh = Math.min(height, wh * 2);
  const sx = splineTaps(ww, mw, mw / ww);
  const sy = splineTaps(wh, mh, mh / wh);
  const rows = [0, 1, 2].map(() => new Float32Array(wh * mw));
  for (let c = 0; c < 3; c++) {
    const src = out[c], dst = rows[c];
    for (let y = 0; y < wh; y++) {
      const base = y * ww;
      for (let x = 0, k = 0; x < mw; x++, k += 4) {
        dst[y * mw + x] =
          src[base + sx.idx[k]] * sx.wts[k] +
          src[base + sx.idx[k + 1]] * sx.wts[k + 1] +
          src[base + sx.idx[k + 2]] * sx.wts[k + 2] +
          src[base + sx.idx[k + 3]] * sx.wts[k + 3];
      }
    }
  }
  const mid = new Int32Array(mw * mh);
  const [srcR, srcG, srcB] = rows;
  for (let y = 0; y < mh; y++) {
    const k = y * 4;
    const r0 = sy.idx[k] * mw, r1 = sy.idx[k + 1] * mw;
    const r2 = sy.idx[k + 2] * mw, r3 = sy.idx[k + 3] * mw;
    const w0 = sy.wts[k], w1 = sy.wts[k + 1], w2 = sy.wts[k + 2], w3 = sy.wts[k + 3];
    for (let x = 0, o = y * mw; x < mw; x++, o++) {
      let r = srcR[r0 + x] * w0 + srcR[r1 + x] * w1 + srcR[r2 + x] * w2 + srcR[r3 + x] * w3 + 0.5;
      let g = srcG[r0 + x] * w0 + srcG[r1 + x] * w1 + srcG[r2 + x] * w2 + srcG[r3 + x] * w3 + 0.5;
      let b = srcB[r0 + x] * w0 + srcB[r1 + x] * w1 + srcB[r2 + x] * w2 + srcB[r3 + x] * w3 + 0.5;
      r = r < 255 ? r | 0 : 255;
      g = g < 255 ? g | 0 : 255;
      b = b < 255 ? b | 0 : 255;
      mid[o] = r | (g << 8) | (b << 16);
    }
  }

  // Packed bilinear, separably: lerp two mid rows, then along the row.
  const colI = new Int32Array(width);
  const colF = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    let f = ((x + 0.5) * mw) / width - 0.5;
    f = f < 0 ? 0 : f > mw - 1 ? mw - 1 : f;
    const i = Math.min(mw - 2, f | 0);
    colI[x] = i < 0 ? 0 : i;
    colF[x] = mw > 1 ? Math.round((f - colI[x]) * 256) : 0;
  }
  const tmp = new Int32Array(mw + 1);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    let f = ((y + 0.5) * mh) / height - 0.5;
    f = f < 0 ? 0 : f > mh - 1 ? mh - 1 : f;
    const y0 = f | 0;
    const y1 = y0 + 1 < mh ? y0 + 1 : y0;
    const fy = Math.round((f - y0) * 256);
    const a = y0 * mw, b = y1 * mw;
    for (let x = 0; x < mw; x++) tmp[x] = lerp(mid[a + x], mid[b + x], fy);
    tmp[mw] = tmp[mw - 1];
    for (let x = 0, o = y * width; x < width; x++, o++) {
      const i = colI[x];
      out32[o] = lerp(tmp[i], tmp[i + 1], colF[x]) | 0xff000000;
    }
  }
}
