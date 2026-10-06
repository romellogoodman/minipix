// Float-plane blurs shared by the worker renderers.

// In-place separable box blur over a w x h float plane, using running sums
// and clamped edges. `tmp` is scratch of the same size; r must be >= 1.
export function boxBlur(a, w, h, r, tmp) {
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
