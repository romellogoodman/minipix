// Average {r, g, b} of a blockSize × blockH block, clipped to the image.
export const getAverageColorInBlock = (
  imageData,
  startX,
  startY,
  blockSize,
  imageWidth,
  imageHeight,
  blockH = blockSize
) => {
  const data = imageData.data;
  let r = 0,
    g = 0,
    b = 0;

  const endX = Math.min(startX + blockSize, imageWidth);
  const endY = Math.min(startY + blockH, imageHeight);
  const count = (endX - startX) * (endY - startY);

  for (let y = startY; y < endY; y++) {
    let index = (y * imageWidth + startX) * 4;
    for (let x = startX; x < endX; x++, index += 4) {
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
    }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
};

// Fisher-Yates shuffle into a new array.
export const shuffleArray = (array, randomFn = Math.random) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Rec. 601 luma, 0..1.
export const getLuminance = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// Scalar variant of findNearestColor for per-pixel loops, where allocating a
// {r, g, b} object per pixel is measurable on multi-megapixel images.
const findNearestColorRGB = (r, g, b, palette) => {
  let minDist = Infinity;
  let nearest = palette[0];

  for (const paletteColor of palette) {
    const dr = r - paletteColor.r;
    const dg = g - paletteColor.g;
    const db = b - paletteColor.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      nearest = paletteColor;
    }
  }

  return nearest;
};

// Nearest palette colour by squared RGB distance.
export const findNearestColor = (color, palette) =>
  findNearestColorRGB(color.r, color.g, color.b, palette);

// Up to numColors dominant colours via median cut over every sampleRate-th
// pixel in each direction.
export const extractDominantColors = (imageData, numColors, sampleRate = 10) => {
  const pixels = [];
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y += sampleRate) {
    for (let x = 0; x < width; x += sampleRate) {
      const idx = (y * width + x) * 4;
      pixels.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      });
    }
  }

  // Sorts the bucket along its widest channel and splits it at the median.
  const splitBucket = (bucket) => {
    let rMin = 255,
      rMax = 0;
    let gMin = 255,
      gMax = 0;
    let bMin = 255,
      bMax = 0;

    for (const pixel of bucket) {
      rMin = Math.min(rMin, pixel.r);
      rMax = Math.max(rMax, pixel.r);
      gMin = Math.min(gMin, pixel.g);
      gMax = Math.max(gMax, pixel.g);
      bMin = Math.min(bMin, pixel.b);
      bMax = Math.max(bMax, pixel.b);
    }

    const rRange = rMax - rMin;
    const gRange = gMax - gMin;
    const bRange = bMax - bMin;

    if (rRange >= gRange && rRange >= bRange) {
      bucket.sort((a, b) => a.r - b.r);
    } else if (gRange >= rRange && gRange >= bRange) {
      bucket.sort((a, b) => a.g - b.g);
    } else {
      bucket.sort((a, b) => a.b - b.b);
    }

    const median = Math.floor(bucket.length / 2);
    return [bucket.slice(0, median), bucket.slice(median)];
  };

  // Keep splitting the largest bucket until there are numColors.
  let buckets = [pixels];
  while (buckets.length < numColors) {
    let largestBucket = buckets[0];
    let largestIndex = 0;

    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].length > largestBucket.length) {
        largestBucket = buckets[i];
        largestIndex = i;
      }
    }

    // Can't split a bucket with ≤1 pixel; stop early rather than produce NaN.
    if (largestBucket.length <= 1) break;

    const [bucket1, bucket2] = splitBucket(largestBucket);
    buckets.splice(largestIndex, 1, bucket1, bucket2);
  }

  return buckets.filter((b) => b.length > 0).map((bucket) => {
    let r = 0,
      g = 0,
      b = 0;
    for (const pixel of bucket) {
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
    const count = bucket.length;
    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
    };
  });
};

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Exact nearest-palette lookup for dithering loops, over the palette with
// duplicates removed (same colours, same first-minimum order). Colour space
// [-128, 384)³ is cut into 4-unit cells keyed (r+128)>>2 << 14 | (g+128)>>2 << 7
// | (b+128)>>2 and classified lazily: a cell whose every point has the same
// nearest colour stores its index + 1; a cell straddling a boundary stores 255,
// and the caller falls back to `exact`, so results match findNearestColorRGB.
const createNearestLookup = (palette) => {
  const colors = [];
  for (const c of palette) if (!colors.some((u) => u.r === c.r && u.g === c.g && u.b === c.b)) colors.push(c);
  const n = colors.length;
  const pr = Float64Array.from(colors, (c) => c.r);
  const pg = Float64Array.from(colors, (c) => c.g);
  const pb = Float64Array.from(colors, (c) => c.b);
  const exact = (r, g, b) => {
    let minDist = Infinity, best = 0;
    for (let p = 0; p < n; p++) {
      const dr = r - pr[p], dg = g - pg[p], db = b - pb[p];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) { minDist = dist; best = p; }
    }
    return best;
  };
  // 0 = unclassified, 255 = ambiguous, else nearest index + 1.
  const lut = new Uint8Array(128 * 128 * 128);
  const margin = 4 * Math.sqrt(3) + 1e-6; // two half-diagonals of a cell
  const classify = (k) => {
    const cr = (k >> 14) * 4 - 126, cg = ((k >> 7) & 127) * 4 - 126, cb = (k & 127) * 4 - 126;
    let d1 = Infinity, d2 = Infinity, best = 0;
    for (let p = 0; p < n; p++) {
      const dr = cr - pr[p], dg = cg - pg[p], db = cb - pb[p];
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    return (lut[k] = d2 - d1 > margin ? best + 1 : 255);
  };
  // Opaque RGBA words, for writing through a Uint32Array view.
  const words = new Uint32Array(n);
  new Uint8Array(words.buffer).set(colors.flatMap((c) => [c.r, c.g, c.b, 255]));
  return { pr, pg, pb, lut, classify, exact, words };
};

// Ordered (4×4 Bayer) dither to the palette; returns new ImageData.
export const applyBayerDithering = (imageData, palette) => {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const out32 = new Uint32Array(output.data.buffer);
  const { lut, classify, exact, words } = createNearestLookup(palette);
  const ditherStrength = 32;
  // (t/16 - 0.5) * 32 is an integer, so clamped inputs are integers 0..255.
  const dither = BAYER_4X4.map((row) => row.map((t) => (t / 16 - 0.5) * ditherStrength));

  for (let y = 0; y < height; y++) {
    const dRow = dither[y & 3];
    for (let x = 0, p = y * width, idx = p * 4; x < width; x++, p++, idx += 4) {
      const d = dRow[x & 3];
      const r = Math.max(0, Math.min(255, data[idx] + d));
      const g = Math.max(0, Math.min(255, data[idx + 1] + d));
      const b = Math.max(0, Math.min(255, data[idx + 2] + d));
      // Same cell key as lookup.index, on integers already inside its range.
      const k = ((r + 128) >> 2 << 14) | ((g + 128) >> 2 << 7) | ((b + 128) >> 2);
      let e = lut[k];
      if (e === 0) e = classify(k);
      out32[p] = words[e !== 255 ? e - 1 : exact(r, g, b)];
    }
  }

  return output;
};

// Floyd-Steinberg error-diffusion dither to the palette; returns new ImageData.
export const applyFloydSteinbergDithering = (imageData, palette) => {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const out32 = new Uint32Array(output.data.buffer);
  // Error diffusion keeps values hovering on palette boundaries, where a
  // lookup table can't decide, so search the (deduplicated) palette directly.
  const { pr, pg, pb, words } = createNearestLookup(palette);
  const n = words.length;
  const fr = Math.fround;
  // Diffused error is accumulated with float32 rounding after every add, so
  // fractional / negative error isn't lost to Uint8ClampedArray truncation.
  // The pending sums for the next pixel and the three next-row cells stay in
  // locals (same values, same add order as a full float32 error buffer); only
  // the next row's finished sums go to memory.
  let cur = new Float32Array(width * 3);
  let next = new Float32Array(width * 3);
  const w7 = 7 / 16, w3 = 3 / 16, w5 = 5 / 16, w1 = 1 / 16;

  for (let y = 0; y < height; y++) {
    const hasNext = y + 1 < height;
    // Right-neighbour carry (·7/16) and next-row partial sums for cells x-1 (a) and x (b).
    let kR = 0, kG = 0, kB = 0;
    let aR = 0, aG = 0, aB = 0, bR = 0, bG = 0, bB = 0;
    for (let x = 0, p = y * width, idx = p * 4, e = 0; x < width; x++, p++, idx += 4, e += 3) {
      const oldR = data[idx] + fr(cur[e] + kR);
      const oldG = data[idx + 1] + fr(cur[e + 1] + kG);
      const oldB = data[idx + 2] + fr(cur[e + 2] + kB);

      let minDist = Infinity, c = 0;
      for (let q = 0; q < n; q++) {
        const dr = oldR - pr[q], dg = oldG - pg[q], db = oldB - pb[q];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) { minDist = dist; c = q; }
      }
      out32[p] = words[c];

      const errR = oldR - pr[c];
      const errG = oldG - pg[c];
      const errB = oldB - pb[c];

      // Targets in the original order: (x+1, y), (x-1, y+1), (x, y+1), (x+1, y+1).
      kR = errR * w7; kG = errG * w7; kB = errB * w7;
      if (hasNext) {
        if (x > 0) {
          next[e - 3] = fr(aR + errR * w3); next[e - 2] = fr(aG + errG * w3); next[e - 1] = fr(aB + errB * w3);
        }
        aR = fr(bR + errR * w5); aG = fr(bG + errG * w5); aB = fr(bB + errB * w5);
        bR = fr(errR * w1); bG = fr(errG * w1); bB = fr(errB * w1);
      }
    }
    if (hasNext) {
      const e = (width - 1) * 3;
      next[e] = aR; next[e + 1] = aG; next[e + 2] = aB;
    }
    const t = cur; cur = next; next = t;
  }

  return output;
};

/**
 * Colour ramps for mapping a 0..1 scalar (edge energy, "motion" masks) to
 * colour, in the spirit of a thermal / motion-heatmap view. Each ramp is a
 * list of evenly spaced RGB stops.
 */
export const COLOR_RAMPS = {
  heat: [[0, 0, 0], [0, 0, 140], [0, 180, 255], [255, 240, 0], [255, 60, 0], [255, 255, 255]],
  thermal: [[10, 0, 30], [80, 0, 120], [220, 50, 50], [255, 170, 0], [255, 255, 180]],
  ice: [[0, 0, 0], [0, 40, 90], [0, 150, 200], [170, 240, 255], [255, 255, 255]],
  toxic: [[0, 0, 0], [20, 60, 0], [90, 200, 0], [220, 255, 60], [255, 255, 255]],
  magenta: [[0, 0, 0], [60, 0, 60], [200, 0, 160], [255, 120, 220], [255, 255, 255]],
};

// Linearly interpolates a ramp at t (clamped to 0..1) → [r, g, b].
const sampleRamp = (ramp, t) => {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const pos = clamped * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = ramp[i], b = ramp[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

// Bakes a ramp into a flat RGB lookup table (size × 3 bytes) so per-pixel
// colouring is a single indexed read.
export const buildRampLUT = (ramp, size = 256) => {
  const lut = new Uint8ClampedArray(size * 3);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = sampleRamp(ramp, i / (size - 1));
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
};
