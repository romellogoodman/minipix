import { randInt, randFloat } from "../utils.js";

/**
 * Oil paint: a Kuwahara filter (4 quadrants, the lowest colour variance wins)
 * posterized to a few levels and re-saturated. The Kuwahara means are smooth
 * patches at the brush scale, so on large images they are computed on a
 * box-downsampled copy (radius scaled to match) and bilinearly upsampled;
 * posterization then happens per full-resolution pixel, keeping its edges crisp.
 */
export default function oilPaint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const radius = Math.max(2, Math.round(minDim * randFloat(config.radiusPercent, random)));
  const levels = randInt(config.levels, random);
  const saturation = randFloat(config.saturation, random);

  const quantStep = 255 / (levels - 1);
  const invQuantStep = 1 / quantStep;

  // Work scale: keep at least ~5 px of radius at the reduced resolution.
  const sc = Math.max(1, Math.min(4, Math.floor(radius / 5)));
  const w = Math.max(1, Math.floor(width / sc)), h = Math.max(1, Math.floor(height / sc));
  const r = sc === 1 ? radius : Math.max(2, Math.round(radius / sc));

  // Box-downsampled RGB planes (sc × sc blocks).
  const n = w * h;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const invArea = 1 / (sc * sc);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let dy = 0; dy < sc; dy++) {
        for (let dx = 0, i = ((y * sc + dy) * width + x * sc) * 4; dx < sc; dx++, i += 4) {
          sr += imageData[i]; sg += imageData[i + 1]; sb += imageData[i + 2];
        }
      }
      const o = y * w + x;
      R[o] = sr * invArea; G[o] = sg * invArea; B[o] = sb * invArea;
    }
  }
  const mean = kuwahara(R, G, B, w, h, r);

  // Posterized + re-saturated colour for every (r, g, b) level triple.
  const L = Math.max(2, Math.round(levels));
  const lut = new Uint32Array(L * L * L);
  for (let qr = 0; qr < L; qr++) {
    for (let qg = 0; qg < L; qg++) {
      for (let qb = 0; qb < L; qb++) {
        const br = qr * quantStep, bg = qg * quantStep, bb = qb * quantStep;
        const lum = 0.299 * br + 0.587 * bg + 0.114 * bb;
        lut[(qr * L + qg) * L + qb] = 0xff000000 |
          (clamp8(lum + (bb - lum) * saturation) << 16) |
          (clamp8(lum + (bg - lum) * saturation) << 8) |
          clamp8(lum + (br - lum) * saturation);
      }
    }
  }
  const qMax = L - 1;
  const quant = (v) => { const q = (v * invQuantStep + 0.5) | 0; return q > qMax ? qMax : q; };

  // Bilinear upsample of the means, then posterize per pixel.
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const x0s = new Int32Array(width), x1s = new Int32Array(width), fxs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.max(0, Math.min(w - 1, (x + 0.5) / sc - 0.5));
    x0s[x] = Math.floor(g); x1s[x] = Math.min(w - 1, x0s[x] + 1); fxs[x] = g - x0s[x];
  }
  const rowR = new Float32Array(w), rowG = new Float32Array(w), rowB = new Float32Array(w);
  for (let y = 0; y < height; y++) {
    const g = Math.max(0, Math.min(h - 1, (y + 0.5) / sc - 0.5));
    const a0 = Math.floor(g) * w * 3, a1 = Math.min(h - 1, Math.floor(g) + 1) * w * 3, fy = g - Math.floor(g);
    for (let x = 0, k = 0; x < w; x++, k += 3) {
      rowR[x] = mean[a0 + k] + (mean[a1 + k] - mean[a0 + k]) * fy;
      rowG[x] = mean[a0 + k + 1] + (mean[a1 + k + 1] - mean[a0 + k + 1]) * fy;
      rowB[x] = mean[a0 + k + 2] + (mean[a1 + k + 2] - mean[a0 + k + 2]) * fy;
    }
    const o = y * width;
    for (let x = 0; x < width; x++) {
      const a = x0s[x], b = x1s[x], f = fxs[x];
      const mr = rowR[a] + (rowR[b] - rowR[a]) * f;
      const mg = rowG[a] + (rowG[b] - rowG[a]) * f;
      const mb = rowB[a] + (rowB[b] - rowB[a]) * f;
      out32[o + x] = lut[(quant(mr) * L + quant(mg)) * L + quant(mb)];
    }
  }
}

// Uint8ClampedArray store semantics (round, clamp) for a packed write.
function clamp8(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
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
