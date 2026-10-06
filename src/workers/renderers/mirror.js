import { randFloat } from "../utils.js";

// Reflect a coordinate back into [0, max] (mirror-repeat edges).
function fold(v, max) {
  if (v >= 0 && v <= max) return v;
  const p = 2 * max;
  v %= p;
  if (v < 0) v += p;
  return v > max ? p - v : v;
}

// Bilinear RGB sample at an in-bounds (x, y), written to out[o..o+2].
function bilinear(src, width, x, y, out, o) {
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = fx > 0 ? i00 + 4 : i00;
  const i01 = fy > 0 ? i00 + width * 4 : i00;
  const i11 = fx > 0 ? i01 + 4 : i01;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
  out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
  out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x - px, dy = y - py;
      let d = dx * n1x + dy * n1y;
      if (d > 0) { dx -= 2 * d * n1x; dy -= 2 * d * n1y; }
      if (twoLines) {
        d = dx * n2x + dy * n2y;
        if (d > 0) { dx -= 2 * d * n2x; dy -= 2 * d * n2y; }
      }
      let sx = fold(px + dx, maxX);
      let sy = fold(py + dy, maxY);
      if (flipX) sx = maxX - sx;
      if (flipY) sy = maxY - sy;
      const o = (y * width + x) * 4;
      bilinear(imageData, width, sx, sy, outputData, o);
      outputData[o + 3] = 255;
    }
  }
}
