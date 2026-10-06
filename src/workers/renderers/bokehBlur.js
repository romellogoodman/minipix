import { randFloat, randInt } from "../utils.js";

const WORK_MAX = 800;
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

  const block = Math.max(1, Math.ceil(Math.max(width, height) / WORK_MAX));
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
  const toLinear = new Float32Array(256);
  for (let i = 0; i < 256; i++) toLinear[i] = Math.pow(i / 255, 2.2);
  const wn = ww * wh;
  const lin = [new Float32Array(wn), new Float32Array(wn), new Float32Array(wn)];
  const counts = new Float32Array(wn);
  const maxWX = ww - 1;
  const maxWY = wh - 1;
  const [lin0, lin1, lin2] = lin;
  // Horizontal tent taps depend only on x.
  const colX0 = new Int32Array(width);
  const colX1 = new Int32Array(width);
  const colTX = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let fx = (x + 0.5) / block - 0.5;
    fx = fx < 0 ? 0 : fx;
    const x0 = fx | 0;
    colX0[x] = x0;
    colX1[x] = x0 < maxWX ? x0 + 1 : x0;
    colTX[x] = fx - x0;
  }
  // One pixel's tent splat straight into the planes.
  const splat = (i, x, a, c, ty) => {
    const r = toLinear[imageData[i]], g = toLinear[imageData[i + 1]], b = toLinear[imageData[i + 2]];
    const x0 = colX0[x], x1 = colX1[x], tx = colTX[x];
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    lin0[a + x0] += r * w00; lin1[a + x0] += g * w00; lin2[a + x0] += b * w00; counts[a + x0] += w00;
    lin0[a + x1] += r * w10; lin1[a + x1] += g * w10; lin2[a + x1] += b * w10; counts[a + x1] += w10;
    lin0[c + x0] += r * w01; lin1[c + x0] += g * w01; lin2[c + x0] += b * w01; counts[c + x0] += w01;
    lin0[c + x1] += r * w11; lin1[c + x1] += g * w11; lin2[c + x1] += b * w11; counts[c + x1] += w11;
  };
  const f32 = Math.fround;
  for (let y = 0; y < height; y++) {
    let fy = (y + 0.5) / block - 0.5;
    fy = fy < 0 ? 0 : fy;
    const y0 = fy | 0;
    const y1 = y0 < maxWY ? y0 + 1 : y0;
    const ty = fy - y0;
    const a = y0 * ww, c = y1 * ww;
    let x = 0;
    let i = y * width * 4;
    if (y1 !== y0) {
      // Consecutive pixels share their four target cells, so run each group
      // of cells in locals (rounded to float32 per add, exactly as the stores
      // would) and write them back once. Cells that coincide fall through to
      // splat().
      const wy0 = 1 - ty;
      while (x < width && colX1[x] !== colX0[x]) {
        const x0 = colX0[x], x1 = colX1[x];
        const p00 = a + x0, p10 = a + x1, p01 = c + x0, p11 = c + x1;
        let r00 = lin0[p00], g00 = lin1[p00], b00 = lin2[p00], n00 = counts[p00];
        let r10 = lin0[p10], g10 = lin1[p10], b10 = lin2[p10], n10 = counts[p10];
        let r01 = lin0[p01], g01 = lin1[p01], b01 = lin2[p01], n01 = counts[p01];
        let r11 = lin0[p11], g11 = lin1[p11], b11 = lin2[p11], n11 = counts[p11];
        for (; x < width && colX0[x] === x0; x++, i += 4) {
          const r = toLinear[imageData[i]], g = toLinear[imageData[i + 1]], b = toLinear[imageData[i + 2]];
          const tx = colTX[x];
          const w00 = (1 - tx) * wy0, w10 = tx * wy0, w01 = (1 - tx) * ty, w11 = tx * ty;
          r00 = f32(r00 + r * w00); g00 = f32(g00 + g * w00); b00 = f32(b00 + b * w00); n00 = f32(n00 + w00);
          r10 = f32(r10 + r * w10); g10 = f32(g10 + g * w10); b10 = f32(b10 + b * w10); n10 = f32(n10 + w10);
          r01 = f32(r01 + r * w01); g01 = f32(g01 + g * w01); b01 = f32(b01 + b * w01); n01 = f32(n01 + w01);
          r11 = f32(r11 + r * w11); g11 = f32(g11 + g * w11); b11 = f32(b11 + b * w11); n11 = f32(n11 + w11);
        }
        lin0[p00] = r00; lin1[p00] = g00; lin2[p00] = b00; counts[p00] = n00;
        lin0[p10] = r10; lin1[p10] = g10; lin2[p10] = b10; counts[p10] = n10;
        lin0[p01] = r01; lin1[p01] = g01; lin2[p01] = b01; counts[p01] = n01;
        lin0[p11] = r11; lin1[p11] = g11; lin2[p11] = b11; counts[p11] = n11;
      }
    }
    for (; x < width; x++, i += 4) splat(i, x, a, c, ty);
  }

  for (let i = 0; i < wn; i++) {
    const inv = 1 / counts[i];
    lin[0][i] *= inv;
    lin[1][i] *= inv;
    lin[2][i] *= inv;
  }
  // Soften slightly first: a flat aperture keeps the kinks of hard edges
  // (JPEG block seams show up as a lattice), a real lens doesn't.
  const tmp = new Float32Array(wn);
  for (const plane of lin) for (let k = 0; k < 2; k++) smooth121(plane, tmp, ww, wh);

  // Highlights are the brightest `percentile` of the image (perceptual
  // luminance), so every image gets some discs.
  const lumOf = new Float32Array(wn);
  const hist = new Uint32Array(256);
  for (let i = 0; i < wn; i++) {
    const l = Math.pow(0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i], 1 / 2.2);
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

  // Gather: each channel sums its own aperture's runs. Runs are the outer
  // loop so a whole output row accumulates with sequential reads.
  const out = [new Float32Array(wn), new Float32Array(wn), new Float32Array(wn)];
  const accC = new Float64Array(ww);
  const accW = new Float64Array(ww);
  for (let c = 0; c < 3; c++) {
    const { spans } = kernels[c];
    const Pc = P[c];
    const outC = out[c];
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
      for (let x = 0; x < ww; x++) outC[o + x] = Math.pow(accC[x] / accW[x], 1 / 2.2) * 255;
    }
  }

  // Separable cubic B-spline upsample (bilinear leaves visible Mach bands
  // at the work-grid knots once the image is this smooth).
  const sx = splineTaps(ww, width, width / ww);
  const sy = splineTaps(wh, height, height / wh);
  const rows = [0, 1, 2].map(() => new Float32Array(wh * width));
  for (let c = 0; c < 3; c++) {
    const src = out[c], dst = rows[c];
    for (let y = 0; y < wh; y++) {
      const base = y * ww;
      for (let x = 0, k = 0; x < width; x++, k += 4) {
        dst[y * width + x] =
          src[base + sx.idx[k]] * sx.wts[k] +
          src[base + sx.idx[k + 1]] * sx.wts[k + 1] +
          src[base + sx.idx[k + 2]] * sx.wts[k + 2] +
          src[base + sx.idx[k + 3]] * sx.wts[k + 3];
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const k = y * 4;
    const r0 = sy.idx[k] * width, r1 = sy.idx[k + 1] * width;
    const r2 = sy.idx[k + 2] * width, r3 = sy.idx[k + 3] * width;
    const w0 = sy.wts[k], w1 = sy.wts[k + 1], w2 = sy.wts[k + 2], w3 = sy.wts[k + 3];
    const [srcR, srcG, srcB] = rows;
    for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
      outputData[o] = srcR[r0 + x] * w0 + srcR[r1 + x] * w1 + srcR[r2 + x] * w2 + srcR[r3 + x] * w3;
      outputData[o + 1] = srcG[r0 + x] * w0 + srcG[r1 + x] * w1 + srcG[r2 + x] * w2 + srcG[r3 + x] * w3;
      outputData[o + 2] = srcB[r0 + x] * w0 + srcB[r1 + x] * w1 + srcB[r2 + x] * w2 + srcB[r3 + x] * w3;
      outputData[o + 3] = 255;
    }
  }
}
