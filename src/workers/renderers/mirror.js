import { randFloat } from "../utils.js";

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

/**
 * Mirror across a line through a random point at a random angle (after
 * Mirror + Flip): pixels on the far side read the reflection of the near
 * side. Angles sometimes snap to the axes for a classic book-matched look,
 * a second line can fold the result again, and the source may be flipped
 * first so the kept half varies.
 */
export default function mirror({ imageData, width, height, config, random, outputData }) {
  const spread = randFloat(config.secondAngle, random);
  const px = (0.3 + 0.4 * random()) * width;
  const py = (0.3 + 0.4 * random()) * height;
  const snap = random() < config.snapProbability;
  let angle = random() * Math.PI * 2;
  if (snap) angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const twoLines = random() < config.twoLinesProbability;
  const flipX = random() < config.flipProbability;
  const flipY = random() < config.flipProbability;

  // Unit normals; a point is reflected when it's on the positive side.
  const n1x = -Math.sin(angle), n1y = Math.cos(angle);
  const turn = random() < 0.5 ? -1 : 1;
  // Snapped mirrors fold into quarters; free ones into a wedge.
  const angle2 = angle + turn * (snap ? Math.PI / 2 : (spread * Math.PI) / 180);
  const n2x = -Math.sin(angle2), n2y = Math.cos(angle2);

  const maxX = width - 1, maxY = height - 1;
  const src32 = new Uint32Array(imageData.buffer, imageData.byteOffset, width * height);
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    // Unreflected pixels read themselves (or their flipped twin): a straight copy.
    const copyRow = (flipY ? maxY - y : y) * width;
    const dy0 = y - py;
    for (let x = 0; x < width; x++) {
      let dx = x - px, dy = dy0, moved = false;
      let d = dx * n1x + dy * n1y;
      if (d > 0) { dx -= 2 * d * n1x; dy -= 2 * d * n1y; moved = true; }
      if (twoLines) {
        d = dx * n2x + dy * n2y;
        if (d > 0) { dx -= 2 * d * n2x; dy -= 2 * d * n2y; moved = true; }
      }
      if (!moved) {
        out32[row + x] = src32[copyRow + (flipX ? maxX - x : x)] | 0xff000000;
        continue;
      }
      // Mirror-repeat edges: one bounce covers almost everything.
      let sx = px + dx, sy = py + dy;
      if (sx < 0) sx = -sx;
      if (sx > maxX) { sx = 2 * maxX - sx; if (sx < 0) sx = fold(sx, maxX); }
      if (sy < 0) sy = -sy;
      if (sy > maxY) { sy = 2 * maxY - sy; if (sy < 0) sy = fold(sy, maxY); }
      if (flipX) sx = maxX - sx;
      if (flipY) sy = maxY - sy;
      // Bilinear sample in 8-bit fixed point on packed RGBA words: red and
      // blue lerp together in one word, green on its own; alpha forced opaque.
      const X = (sx * 256) | 0, Y = (sy * 256) | 0;
      const fx = X & 255, fy = Y & 255;
      const i = (Y >> 8) * width + (X >> 8);
      const p00 = src32[i];
      const p10 = fx ? src32[i + 1] : p00;
      const p01 = fy ? src32[i + width] : p00;
      const p11 = fy ? (fx ? src32[i + width + 1] : p01) : p10;
      const gx = 256 - fx, gy = 256 - fy;
      const rbT = (((p00 & 0xff00ff) * gx + (p10 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
      const rbB = (((p01 & 0xff00ff) * gx + (p11 & 0xff00ff) * fx + 0x800080) >>> 8) & 0xff00ff;
      const rb = ((rbT * gy + rbB * fy + 0x800080) >>> 8) & 0xff00ff;
      const gT = ((p00 >>> 8) & 255) * gx + ((p10 >>> 8) & 255) * fx;
      const gB = ((p01 >>> 8) & 255) * gx + ((p11 >>> 8) & 255) * fx;
      out32[row + x] = 0xff000000 | rb | ((((gT * gy + gB * fy + 0x8000) >>> 16) & 255) << 8);
    }
  }
}
