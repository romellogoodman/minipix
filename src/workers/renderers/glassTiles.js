import { randInt, randFloat } from "../utils.js";

/**
 * Pressed-glass blocks: the image is cut into a (possibly rotated) grid of
 * tiles and each tile refracts its patch — sampling outward from its centre
 * shows a shrunken view of a wider area, sampling inward magnifies the
 * centre. `roundness` turns each block into a domed lens, and an optional
 * bevel lights one edge and shades the other like moulded glass.
 */
export default function glassTiles({ imageData, width, height, config, random, outputData }) {
  const tileCount = randInt(config.tileCount, random);
  const refraction = randFloat(config.refraction, random);
  const magnify = random() < config.magnifyProbability;
  const rotate = random() < config.rotateProbability;
  const angle = random() * Math.PI * 0.5;
  const roundness = randFloat(config.roundness, random);
  const bevel = random() < config.bevelProbability;
  const bevelStrength = randFloat(config.bevelStrength, random);

  // Sampling slope inside a tile: 1 + k. Positive k shrinks a wider area
  // into the tile; negative k zooms in (k = -1 would flatten it to one colour).
  const k = magnify ? -Math.min(0.85, refraction * 0.3) : refraction;
  const tile = Math.max(width, height) / tileCount;
  const offsetScale = k * tile;
  const roundK = roundness * 4;
  const cosA = rotate ? Math.cos(angle) : 1;
  const sinA = rotate ? Math.sin(angle) : 0;
  const bevelWidth = 0.12;
  const bevelAmt = bevel ? bevelStrength : 0;
  const cx = width / 2;
  const cy = height / 2;
  const invTile = 1 / tile;
  // Keep the grid aligned to the image corner when unrotated.
  const originU = rotate ? cx * invTile + 0.5 : cx * invTile;
  const originV = rotate ? cy * invTile + 0.5 : cy * invTile;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      // Grid space (rotated about the image centre).
      const gu = (dx * cosA + dy * sinA) * invTile + originU;
      const gv = (-dx * sinA + dy * cosA) * invTile + originV;
      const lu = gu - Math.floor(gu) - 0.5;
      const lv = gv - Math.floor(gv) - 0.5;
      let f = 1 - (lu * lu + lv * lv) * roundK;
      if (f < 0) f = 0;
      // Offset in grid space, rotated back to image space.
      const ou = lu * offsetScale * f;
      const ov = lv * offsetScale * f;
      const sx = x + ou * cosA - ov * sinA;
      const sy = y + ou * sinA + ov * cosA;
      const o = (y * width + x) * 4;
      sampleBilinear(imageData, width, height, sx, sy, outputData, o);

      if (bevelAmt > 0) {
        // Light from the top-left: brighten the leading edges, shade the trailing ones.
        const eu = edgeRamp(lu, bevelWidth);
        const ev = edgeRamp(lv, bevelWidth);
        const shade = 1 - bevelAmt * (eu + ev);
        outputData[o] = outputData[o] * shade;
        outputData[o + 1] = outputData[o + 1] * shade;
        outputData[o + 2] = outputData[o + 2] * shade;
      }
      outputData[o + 3] = 255;
    }
  }
}

// Signed ramp: -1 at the leading tile edge, +1 at the trailing edge, 0 inside.
function edgeRamp(l, w) {
  const a = Math.abs(l);
  if (a < 0.5 - w) return 0;
  let t = (a - (0.5 - w)) / w;
  t = t * t * (3 - 2 * t);
  return l < 0 ? -t : t;
}

// Bilinear RGB sample with mirrored edges (no clamp streaks), written to dst[o..o+2].
function sampleBilinear(src, width, height, x, y, dst, o) {
  const maxX = width - 1;
  const maxY = height - 1;
  if (x < 0) x = -x;
  if (x > maxX) x = Math.max(0, 2 * maxX - x);
  if (y < 0) y = -y;
  if (y > maxY) y = Math.max(0, 2 * maxY - y);
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = x0 < maxX ? i00 + 4 : i00;
  const i01 = y0 < maxY ? i00 + width * 4 : i00;
  const i11 = x0 < maxX ? i01 + 4 : i01;
  for (let c = 0; c < 3; c++) {
    const a = src[i00 + c];
    const b = src[i01 + c];
    const top = a + (src[i10 + c] - a) * fx;
    const bot = b + (src[i11 + c] - b) * fx;
    dst[o + c] = top + (bot - top) * fy;
  }
}
