// Shuffled 0-255 lattice permutation, doubled to 512 entries so perm[i + 1]
// never wraps. Consumes exactly 255 random() calls, so callers must build it at
// a fixed point in their RNG sequence.
export function createPermutation(random) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

// Gradient per hash & 7: the switch in createNoise2D as coefficients.
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 0, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 1, -1]);

// createNoise2D's noise(x, y) as a plain function of a createPermutation table,
// for hot loops (no closure call). Same values, up to the sign of an exact zero.
export function noise2D(perm, x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const xi = fx & 255, yi = fy & 255;
  const xf = x - fx, yf = y - fy;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const pa = perm[xi], pb = perm[xi + 1];
  const aa = perm[pa + yi] & 7, ab = perm[pa + yi + 1] & 7;
  const ba = perm[pb + yi] & 7, bb = perm[pb + yi + 1] & 7;
  const g1 = GX[aa] * xf + GY[aa] * yf, g2 = GX[ba] * (xf - 1) + GY[ba] * yf;
  const g3 = GX[ab] * xf + GY[ab] * (yf - 1), g4 = GX[bb] * (xf - 1) + GY[bb] * (yf - 1);
  const x1 = g1 + (g2 - g1) * u;
  return x1 + (g3 + (g4 - g3) * u - x1) * v;
}

// Seeded Perlin-style 2D gradient noise; noise(x, y) is roughly in [-1, 1].
// Consumes exactly 255 random() calls when built (see createPermutation).
export function createNoise2D(random) {
  const perm = createPermutation(random);

  const grad = (hash, x, y) => {
    switch (hash & 7) {
      case 0: return  x + y;
      case 1: return -x + y;
      case 2: return  x - y;
      case 3: return -x - y;
      case 4: return  x;
      case 5: return -x;
      case 6: return  y;
      default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const xf = x - fx;
    const yf = y - fy;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}
