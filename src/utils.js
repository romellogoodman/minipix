/**
 * Seeded pseudo-random number generator using Mulberry32 algorithm.
 * @param {number} seed - The seed value for the generator
 * @returns {function(): number} A function that returns random numbers between 0 and 1
 */
export const mulberry32 = (seed) => {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
};

/**
 * Creates a seeded random function from a seed value.
 * @param {number} seed - The seed value
 * @returns {function(): number} A seeded random function
 */
export const createSeededRandom = (seed) => {
  return mulberry32(seed);
};

/**
 * Remaps a number from one range to another range.
 * @param {number} value - The value to remap
 * @param {number} start1 - The lower bound of the input range
 * @param {number} stop1 - The upper bound of the input range
 * @param {number} start2 - The lower bound of the output range
 * @param {number} stop2 - The upper bound of the output range
 * @param {boolean} [withinBounds=false] - Whether to constrain the result within the output range
 * @returns {number} The remapped value
 */
export const map = (
  value,
  start1,
  stop1,
  start2,
  stop2,
  withinBounds = false
) => {
  const mapped =
    start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));

  if (!withinBounds) {
    return mapped;
  }

  if (start2 < stop2) {
    return Math.max(Math.min(mapped, stop2), start2);
  } else {
    return Math.max(Math.min(mapped, start2), stop2);
  }
};

/**
 * Generates a random integer between min and max (inclusive).
 * @param {number} min - The minimum value (inclusive)
 * @param {number} max - The maximum value (inclusive)
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {number} A random integer between min and max
 */
export const randomNumber = (min, max, randomFn = Math.random) => {
  return Math.floor(randomFn() * (max - min + 1)) + min;
};

/**
 * Applies random horizontal and/or vertical flipping to a canvas context.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context to transform
 * @param {number} width - The width of the canvas
 * @param {number} height - The height of the canvas
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {{flipX: boolean, flipY: boolean}} Object indicating which axes were flipped
 */
export const applyRandomFlip = (ctx, width, height, randomFn = Math.random) => {
  const flipX = randomFn() < 0.5;
  const flipY = randomFn() < 0.5;

  if (flipX || flipY) {
    ctx.translate(flipX ? width : 0, flipY ? height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }

  return { flipX, flipY };
};

/**
 * Calculates an adaptive pixel block size based on image dimensions.
 * Returns a value between 0.8% and 10% of the smaller dimension, clamped to 4-150px.
 * @param {number} width - The width of the image
 * @param {number} height - The height of the image
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {number} The calculated pixel block size
 */
export const calculateAdaptivePixelSize = (width, height, randomFn = Math.random) => {
  const baseDimension = Math.min(width, height);

  // Calculate percentage-based range (0.8% to 10% of smaller dimension)
  const minPercent = 0.008;
  const maxPercent = 0.1;

  const minSize = Math.floor(baseDimension * minPercent);
  const maxSize = Math.floor(baseDimension * maxPercent);

  const pixelSize = randomNumber(minSize, maxSize, randomFn);

  // Clamp to reasonable absolute bounds (4-150px)
  return Math.max(4, Math.min(150, pixelSize));
};

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
  imageHeight
) => {
  let r = 0,
    g = 0,
    b = 0,
    count = 0;

  // Calculate actual block boundaries (handle edge cases)
  const endX = Math.min(startX + blockSize, imageWidth);
  const endY = Math.min(startY + blockSize, imageHeight);

  // Sum all pixel values in the block
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (y * imageWidth + x) * 4;
      r += imageData.data[index];
      g += imageData.data[index + 1];
      b += imageData.data[index + 2];
      count++;
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
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/**
 * Finds the nearest color from a palette to a given color.
 * @param {{r: number, g: number, b: number}} color - The target color to match
 * @param {Array<{r: number, g: number, b: number}>} palette - Array of available colors
 * @returns {{r: number, g: number, b: number}} The nearest color from the palette
 */
export const findNearestColor = (color, palette) => {
  let minDist = Infinity;
  let nearest = palette[0];

  for (const paletteColor of palette) {
    const dist = colorDistance(color, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      nearest = paletteColor;
    }
  }

  return nearest;
};

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
    // Find largest bucket
    let largestBucket = buckets[0];
    let largestIndex = 0;

    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].length > largestBucket.length) {
        largestBucket = buckets[i];
        largestIndex = i;
      }
    }

    // Split the largest bucket
    const [bucket1, bucket2] = splitBucket(largestBucket);

    // Replace with two new buckets
    buckets.splice(largestIndex, 1, bucket1, bucket2);
  }

  // Calculate average color for each bucket
  return buckets.map((bucket) => {
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
 * Draws a halftone dot with various shape options.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {number} x - The X coordinate of the dot center
 * @param {number} y - The Y coordinate of the dot center
 * @param {number} radius - The radius of the dot
 * @param {string} shape - The shape type: 'circle', 'square', or 'diamond'
 * @param {{r: number, g: number, b: number}} color - The color to fill the dot
 */
export const drawHalftoneDot = (ctx, x, y, radius, shape, color) => {
  if (radius <= 0) return;

  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "square":
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      break;

    case "diamond":
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();
      break;

    default:
      // Default to circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
  }
};

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
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Get original pixel
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Get Bayer threshold
      const threshold = BAYER_4X4[y % matrixSize][x % matrixSize] / 16;
      const dither = (threshold - 0.5) * ditherStrength;

      // Apply dither and find nearest color
      const dithered = {
        r: Math.max(0, Math.min(255, r + dither)),
        g: Math.max(0, Math.min(255, g + dither)),
        b: Math.max(0, Math.min(255, b + dither)),
      };

      const nearest = findNearestColor(dithered, palette);

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

  // Copy original data to output and create error buffer
  for (let i = 0; i < data.length; i++) {
    output.data[i] = data[i];
  }

  // Error diffusion coefficients (right, bottom-left, bottom, bottom-right)
  const diffusion = [
    { dx: 1, dy: 0, weight: 7 / 16 },
    { dx: -1, dy: 1, weight: 3 / 16 },
    { dx: 0, dy: 1, weight: 5 / 16 },
    { dx: 1, dy: 1, weight: 1 / 16 },
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Get current pixel (with accumulated error)
      const oldPixel = {
        r: output.data[idx],
        g: output.data[idx + 1],
        b: output.data[idx + 2],
      };

      // Find nearest palette color
      const newPixel = findNearestColor(oldPixel, palette);

      // Set quantized pixel
      output.data[idx] = newPixel.r;
      output.data[idx + 1] = newPixel.g;
      output.data[idx + 2] = newPixel.b;
      output.data[idx + 3] = 255;

      // Calculate quantization error
      const errorR = oldPixel.r - newPixel.r;
      const errorG = oldPixel.g - newPixel.g;
      const errorB = oldPixel.b - newPixel.b;

      // Diffuse error to neighboring pixels
      for (const { dx, dy, weight } of diffusion) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = (ny * width + nx) * 4;
          output.data[nidx] = Math.max(
            0,
            Math.min(255, output.data[nidx] + errorR * weight)
          );
          output.data[nidx + 1] = Math.max(
            0,
            Math.min(255, output.data[nidx + 1] + errorG * weight)
          );
          output.data[nidx + 2] = Math.max(
            0,
            Math.min(255, output.data[nidx + 2] + errorB * weight)
          );
        }
      }
    }
  }

  return output;
};
