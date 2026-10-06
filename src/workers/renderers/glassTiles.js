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

  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  // One call per row: the row function optimizes as a normal function rather
  // than via on-stack replacement of one huge loop.
  // Unrotated grids are separable: the in-tile position across depends only
  // on the column, so tabulate it (rotated grids pass null and compute it).
  let luC = null;
  if (!rotate) {
    luC = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      const gu = (x - cx) * invTile + originU;
      luC[x] = gu - Math.floor(gu) - 0.5;
    }
  }
  for (let y = 0; y < height; y++) {
    tilesRow(src32, out32, width, height, y, cx, cy, cosA, sinA, invTile, originU, originV, roundK, offsetScale, bevelAmt, bevelWidth, luC);
  }
}

function tilesRow(src32, out32, width, height, y, cx, cy, cosA, sinA, invTile, originU, originV, roundK, offsetScale, bevelAmt, bevelWidth, luC) {
  const maxX = width - 1, maxY = height - 1;
  // Bilinear corners never step past the last row/column.
  const limX = maxX - 1 / 256, limY = maxY - 1 / 256;
  const dy = y - cy;
  const gvRow = dy * invTile + originV;
  const lvRow = gvRow - Math.floor(gvRow) - 0.5;
  for (let x = 0, p = y * width; x < width; x++, p++) {
    let lu, lv;
    if (luC !== null) {
      lu = luC[x];
      lv = lvRow;
    } else {
      const dx = x - cx;
      // Grid space (rotated about the image centre).
      const gu = (dx * cosA + dy * sinA) * invTile + originU;
      const gv = (-dx * sinA + dy * cosA) * invTile + originV;
      lu = gu - Math.floor(gu) - 0.5;
      lv = gv - Math.floor(gv) - 0.5;
    }
    let f = 1 - (lu * lu + lv * lv) * roundK;
    if (f < 0) f = 0;
    // Offset in grid space, rotated back to image space.
    const ou = lu * offsetScale * f;
    const ov = lv * offsetScale * f;
    // Mirrored edges (no clamp streaks).
    let sx = x + ou * cosA - ov * sinA;
    let sy = y + ou * sinA + ov * cosA;
    if (sx < 0) sx = -sx;
    if (sx > limX) sx = Math.max(0, Math.min(limX, 2 * maxX - sx));
    if (sy < 0) sy = -sy;
    if (sy > limY) sy = Math.max(0, Math.min(limY, 2 * maxY - sy));
    // Bilinear sample in 8-bit fixed point on packed RGBA words: red and
    // blue lerp together in one word, green on its own.
    const X = (sx * 256) | 0, Y = (sy * 256) | 0;
    const fx = X & 255, fy = Y & 255, gx = 256 - fx, gy = 256 - fy;
    const i = (Y >> 8) * width + (X >> 8);
    const p00 = src32[i], p10 = src32[i + 1], p01 = src32[i + width], p11 = src32[i + width + 1];
    const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
    const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
    const rb = ((rbT * gy + rbB * fy + 0x800080) >>> 8) & 0xff00ff;
    const gT = ((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx;
    const gB = ((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx;
    const g = ((gT * gy + gB * fy + 0x8000) >>> 16) & 255;

    if (bevelAmt > 0) {
      // Light from the top-left: brighten the leading edges, shade the trailing ones.
      const eu = edgeRamp(lu, bevelWidth);
      const ev = edgeRamp(lv, bevelWidth);
      if (eu !== 0 || ev !== 0) {
        const shade = 1 - bevelAmt * (eu + ev);
        let r = ((rb & 255) * shade + 0.5) | 0, gg = (g * shade + 0.5) | 0, b = ((rb >>> 16) * shade + 0.5) | 0;
        if (r > 255) r = 255;
        if (gg > 255) gg = 255;
        if (b > 255) b = 255;
        out32[p] = 0xff000000 | (b << 16) | (gg << 8) | r;
        continue;
      }
    }
    out32[p] = 0xff000000 | rb | (g << 8);
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
