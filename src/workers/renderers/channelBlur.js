import { randFloat } from "../utils.js";

// In-place box pass: rows into `tmp`, then columns back into `buf` (running
// sums, clamped edges). The column pass keeps a running row of sums so it
// stays row-major.
function boxPass(buf, tmp, w, h, r) {
  if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  const maxX = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += buf[row + (k < 0 ? 0 : k > maxX ? maxX : k)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * inv;
      const add = x + r + 1;
      const sub = x - r;
      sum += buf[row + (add > maxX ? maxX : add)] - buf[row + (sub < 0 ? 0 : sub)];
    }
  }
  const maxY = h - 1;
  const acc = new Float64Array(w);
  for (let k = -r; k <= r; k++) {
    const row = (k < 0 ? 0 : k > maxY ? maxY : k) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const out = y * w;
    const add = (y + r + 1 > maxY ? maxY : y + r + 1) * w;
    const sub = (y - r < 0 ? 0 : y - r) * w;
    for (let x = 0; x < w; x++) {
      buf[out + x] = acc[x] * inv;
      acc[x] += tmp[add + x] - tmp[sub + x];
    }
  }
}

/**
 * Independent blur per colour channel (after ChannelBlur): each of R, G and
 * B gets its own Gaussian radius (three box passes) and an optional nudge,
 * so edges split into soft coloured halos. One channel may stay razor sharp,
 * which keeps the image legible under the fringing.
 */
export default function channelBlur({ imageData, width, height, config, random, outputData }) {
  const shortSide = Math.min(width, height);
  const radii = [0, 1, 2].map(() => shortSide * randFloat(config.radiusPercent, random));
  const keepSharp = random() < config.sharpChannelProbability;
  const sharpChannel = Math.floor(random() * 3);
  const useOffset = random() < config.offsetProbability;
  const offsets = [0, 1, 2].map(() => {
    const angle = random() * Math.PI * 2;
    const dist = shortSide * randFloat(config.offsetPercent, random);
    return [Math.round(Math.cos(angle) * dist), Math.round(Math.sin(angle) * dist)];
  });
  if (keepSharp) {
    radii[sharpChannel] = 0;
    offsets[sharpChannel] = [0, 0];
  }

  const n = width * height;
  const plane = new Float32Array(n);
  const tmp = new Float32Array(n);
  const maxX = width - 1;
  const maxY = height - 1;

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) plane[i] = imageData[i * 4 + c];
    // Three box passes of width ~sqrt(12σ²/3 + 1) approximate a Gaussian of σ = radius / 2.
    const sigma = radii[c] / 2;
    const r = Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2);
    for (let pass = 0; pass < 3; pass++) boxPass(plane, tmp, width, height, r);
    const [ox, oy] = useOffset ? offsets[c] : [0, 0];
    for (let y = 0; y < height; y++) {
      let sy = y - oy;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      for (let x = 0; x < width; x++) {
        let sx = x - ox;
        sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
        outputData[(y * width + x) * 4 + c] = plane[sy * width + sx];
      }
    }
  }
  for (let i = 3; i < n * 4; i += 4) outputData[i] = 255;
}
