/**
 * Calculates the average color of all pixels in a block region.
 * @param {ImageData} imageData - The ImageData object containing pixel data
 * @param {number} startX - The starting X coordinate of the block
 * @param {number} startY - The starting Y coordinate of the block
 * @param {number} blockSize - The size of the block in pixels
 * @param {number} imageWidth - The width of the image
 * @param {number} imageHeight - The height of the image
 * @returns {{r: number, g: number, b: number}} Object containing the averaged RGB values
 */
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

  // Sum all pixel values in the block
  for (let y = startY; y < endY; y++) {
    let index = (y * imageWidth + startX) * 4;
    for (let x = startX; x < endX; x++, index += 4) {
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
    }
  }

  // Return average color
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
};

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {Array} array - The array to shuffle
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {Array} A new shuffled array (does not modify the original)
 */
export const shuffleArray = (array, randomFn = Math.random) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Calculates the perceptual luminance/brightness from RGB values.
 * Uses the standard RGB to luminance conversion formula.
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {number} Luminance value between 0 and 1
 */
export const getLuminance = (r, g, b) => {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/**
 * Calculates the Euclidean distance between two colors in RGB space.
 * @param {{r: number, g: number, b: number}} color1 - First color with r, g, b properties
 * @param {{r: number, g: number, b: number}} color2 - Second color with r, g, b properties
 * @returns {number} The Euclidean distance between the two colors
 */
export const colorDistance = (color1, color2) => {
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;
  return dr * dr + dg * dg + db * db;
};

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

/**
 * Finds the nearest color from a palette to a given color.
 * @param {{r: number, g: number, b: number}} color - The target color to match
 * @param {Array<{r: number, g: number, b: number}>} palette - Array of available colors
 * @returns {{r: number, g: number, b: number}} The nearest color from the palette
 */
export const findNearestColor = (color, palette) =>
  findNearestColorRGB(color.r, color.g, color.b, palette);

/**
 * Extracts dominant colors from an image using the median cut algorithm.
 * @param {ImageData} imageData - The ImageData object containing pixel data
 * @param {number} numColors - Number of dominant colors to extract
 * @param {number} [sampleRate=10] - Pixel sampling rate (higher = faster but less accurate)
 * @returns {Array<{r: number, g: number, b: number}>} Array of dominant colors
 */
export const extractDominantColors = (
  imageData,
  numColors,
  sampleRate = 10
) => {
  // Sample pixels to build initial bucket
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

  // Helper to find range and split bucket
  const splitBucket = (bucket) => {
    // Find dimension with greatest range
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

    // Sort by dimension with greatest range
    if (rRange >= gRange && rRange >= bRange) {
      bucket.sort((a, b) => a.r - b.r);
    } else if (gRange >= rRange && gRange >= bRange) {
      bucket.sort((a, b) => a.g - b.g);
    } else {
      bucket.sort((a, b) => a.b - b.b);
    }

    // Split at median
    const median = Math.floor(bucket.length / 2);
    return [bucket.slice(0, median), bucket.slice(median)];
  };

  // Start with one bucket containing all pixels
  let buckets = [pixels];

  // Iteratively split buckets until we have numColors
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

  // Calculate average color for each non-empty bucket
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

/**
 * Bayer 4x4 dithering matrix for ordered dithering.
 * @type {number[][]}
 */
export const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Applies Bayer matrix ordered dithering to an image with a color palette.
 * @param {ImageData} imageData - The ImageData object to dither
 * @param {Array<{r: number, g: number, b: number}>} palette - Array of colors to use for dithering
 * @returns {ImageData} New ImageData with dithering applied
 */
export const applyBayerDithering = (imageData, palette) => {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const matrixSize = 4;
  const ditherStrength = 32; // Adjustable strength

  for (let y = 0; y < height; y++) {
    const bayerRow = BAYER_4X4[y % matrixSize];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Get Bayer threshold
      const threshold = bayerRow[x % matrixSize] / 16;
      const dither = (threshold - 0.5) * ditherStrength;

      // Apply dither and find nearest color
      const nearest = findNearestColorRGB(
        Math.max(0, Math.min(255, data[idx] + dither)),
        Math.max(0, Math.min(255, data[idx + 1] + dither)),
        Math.max(0, Math.min(255, data[idx + 2] + dither)),
        palette
      );

      // Set output pixel
      output.data[idx] = nearest.r;
      output.data[idx + 1] = nearest.g;
      output.data[idx + 2] = nearest.b;
      output.data[idx + 3] = 255;
    }
  }

  return output;
};

/**
 * Applies Floyd-Steinberg error diffusion dithering to an image with a color palette.
 * @param {ImageData} imageData - The ImageData object to dither
 * @param {Array<{r: number, g: number, b: number}>} palette - Array of colors to use for dithering
 * @returns {ImageData} New ImageData with dithering applied
 */
export const applyFloydSteinbergDithering = (imageData, palette) => {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  // Accumulate diffusion in floats so fractional / negative error isn't lost
  // to Uint8ClampedArray truncation and clamping.
  const error = new Float32Array(width * height * 3);

  const diffusion = [
    { dx: 1, dy: 0, weight: 7 / 16 },
    { dx: -1, dy: 1, weight: 3 / 16 },
    { dx: 0, dy: 1, weight: 5 / 16 },
    { dx: 1, dy: 1, weight: 1 / 16 },
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const eidx = (y * width + x) * 3;

      const oldR = data[idx] + error[eidx];
      const oldG = data[idx + 1] + error[eidx + 1];
      const oldB = data[idx + 2] + error[eidx + 2];

      const newPixel = findNearestColorRGB(oldR, oldG, oldB, palette);

      output.data[idx] = newPixel.r;
      output.data[idx + 1] = newPixel.g;
      output.data[idx + 2] = newPixel.b;
      output.data[idx + 3] = 255;

      const errR = oldR - newPixel.r;
      const errG = oldG - newPixel.g;
      const errB = oldB - newPixel.b;

      for (const { dx, dy, weight } of diffusion) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const nidx = (ny * width + nx) * 3;
        error[nidx] += errR * weight;
        error[nidx + 1] += errG * weight;
        error[nidx + 2] += errB * weight;
      }
    }
  }

  return output;
};
