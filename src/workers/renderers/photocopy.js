import { randInt, randFloat } from "../utils.js";

export default function photocopy({ imageData, width, height, config, random, outputData }) {
  const threshold = randFloat(config.threshold, random);
  const noise = randFloat(config.noise, random);
  const generations = randInt(config.generations, random);
  const smear = randInt(config.smear, random);

  const effThreshold = threshold - generations * 0.03;
  const effNoise = noise * (1 + generations * 0.4);
  const tonerSpeckle = 0.002 * generations;

  const bandH = randInt(config.bandHeight, random);
  const band = Math.floor(random() * Math.max(1, height - bandH));

  // Per-pixel jitter and toner speckle come from an inline xorshift32* stream
  // seeded once from the render RNG: 16 bits of each draw jitter the
  // threshold, the other 16 decide the speckle.
  let s = (random() * 4294967296) | 0 || 1;
  // jittered > effThreshold  <=>  minLum > effThreshold - jitter, so fold the
  // jitter into a per-draw threshold, in 0..255 luminance units.
  const thrLUT = new Float32Array(65536);
  for (let k = 0; k < 65536; k++) thrLUT[k] = (effThreshold - ((k + 0.5) / 65536 - 0.5) * effNoise) * 255;
  const speckleCut = Math.round(tonerSpeckle * 65536);

  const out32 = new Int32Array(outputData.buffer, outputData.byteOffset, width * height);
  const rowLum = new Float32Array(width);
  const rowMin = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const inBand = y >= band && y < band + bandH;
    const off = inBand ? 0xffc8c8c8 | 0 : 0xff000000 | 0; // ABGR words
    const flip = off ^ -1; // off ^ flip = white
    const rowBase = y * width;
    for (let x = 0, si = rowBase * 4; x < width; x++, si += 4) {
      rowLum[x] = 0.299 * imageData[si] + 0.587 * imageData[si + 1] + 0.114 * imageData[si + 2];
    }
    // Smear: min over the `smear` pixels to the left, one pass per offset.
    rowMin.set(rowLum);
    for (let k = 1; k <= smear; k++) {
      const edge = rowLum[0];
      for (let x = 0; x <= k && x < width; x++) rowMin[x] = Math.min(rowMin[x], edge);
      for (let x = k + 1; x < width; x++) rowMin[x] = Math.min(rowMin[x], rowLum[x - k]);
    }
    for (let x = 0; x < width; x++) {
      const minLum = rowMin[x];

      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v = Math.imul(s, 0x2545f491);
      // Branch-free: both comparisons are noise-driven and would mispredict.
      const lit = (minLum > thrLUT[v >>> 16]) & ((v & 0xffff) >= speckleCut);
      out32[rowBase + x] = off ^ (flip & -lit);
    }
  }
}
