// Utility function to remap a number from one range to another
export const map = (value, start1, stop1, start2, stop2, withinBounds = false) => {
  const mapped = start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));

  if (!withinBounds) {
    return mapped;
  }

  if (start2 < stop2) {
    return Math.max(Math.min(mapped, stop2), start2);
  } else {
    return Math.max(Math.min(mapped, start2), stop2);
  }
};

// Utility function to generate a random integer between min and max (inclusive)
export const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to apply random flipping
export const applyRandomFlip = (ctx, width, height) => {
  const flipX = Math.random() < 0.5;
  const flipY = Math.random() < 0.5;

  if (flipX || flipY) {
    ctx.translate(flipX ? width : 0, flipY ? height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }

  return { flipX, flipY };
};

// Helper function to calculate adaptive pixel block size based on image dimensions
export const calculateAdaptivePixelSize = (width, height) => {
  const baseDimension = Math.min(width, height);

  // Calculate percentage-based range (0.8% to 10% of smaller dimension)
  const minPercent = 0.008;
  const maxPercent = 0.1;

  const minSize = Math.floor(baseDimension * minPercent);
  const maxSize = Math.floor(baseDimension * maxPercent);

  const pixelSize = randomNumber(minSize, maxSize);

  // Clamp to reasonable absolute bounds (4-150px)
  return Math.max(4, Math.min(150, pixelSize));
};

// Helper function to calculate average color of all pixels in a block
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

// Helper function to shuffle an array using Fisher-Yates algorithm
export const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Calculate perceptual luminance/brightness from RGB (0-1)
export const getLuminance = (r, g, b) => {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

// Calculate Euclidean distance between two colors in RGB space
export const colorDistance = (color1, color2) => {
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// Find nearest color from a palette
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

// Extract dominant colors using median cut algorithm
export const extractDominantColors = (imageData, numColors, sampleRate = 10) => {
  // Sample pixels to build initial bucket
  const pixels = [];
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y += sampleRate) {
    for (let x = 0; x < width; x += sampleRate) {
      const idx = (y * width + x) * 4;
      pixels.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2]
      });
    }
  }

  // Helper to find range and split bucket
  const splitBucket = (bucket) => {
    // Find dimension with greatest range
    let rMin = 255, rMax = 0;
    let gMin = 255, gMax = 0;
    let bMin = 255, bMax = 0;

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
  return buckets.map(bucket => {
    let r = 0, g = 0, b = 0;
    for (const pixel of bucket) {
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
    const count = bucket.length;
    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count)
    };
  });
};

// Bayer 4x4 dithering matrix
export const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

// Draw a halftone dot with various shapes
export const drawHalftoneDot = (ctx, x, y, radius, shape, color) => {
  if (radius <= 0) return;

  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;

  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      break;

    case 'diamond':
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

// Apply Bayer matrix dithering
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
        b: Math.max(0, Math.min(255, b + dither))
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

// Apply Floyd-Steinberg error diffusion dithering
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
    { dx: 1, dy: 1, weight: 1 / 16 }
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Get current pixel (with accumulated error)
      const oldPixel = {
        r: output.data[idx],
        g: output.data[idx + 1],
        b: output.data[idx + 2]
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
          output.data[nidx] = Math.max(0, Math.min(255, output.data[nidx] + errorR * weight));
          output.data[nidx + 1] = Math.max(0, Math.min(255, output.data[nidx + 1] + errorG * weight));
          output.data[nidx + 2] = Math.max(0, Math.min(255, output.data[nidx + 2] + errorB * weight));
        }
      }
    }
  }

  return output;
};

// Generate Poisson disk sampling points for even distribution
export const generatePoissonDiskPoints = (width, height, minDist, maxAttempts = 30) => {
  const points = [];
  const grid = [];
  const cellSize = minDist / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);

  // Initialize grid
  for (let i = 0; i < gridWidth * gridHeight; i++) {
    grid[i] = null;
  }

  // Helper to get grid index
  const gridIndex = (x, y) => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    return gy * gridWidth + gx;
  };

  // Helper to check if point is valid
  const isValidPoint = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;

    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);

    // Check neighboring cells
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ngx = gx + dx;
        const ngy = gy + dy;

        if (ngx >= 0 && ngx < gridWidth && ngy >= 0 && ngy < gridHeight) {
          const neighbor = grid[ngy * gridWidth + ngx];
          if (neighbor) {
            const dist = Math.sqrt((x - neighbor.x) ** 2 + (y - neighbor.y) ** 2);
            if (dist < minDist) return false;
          }
        }
      }
    }

    return true;
  };

  // Start with random point
  const firstPoint = {
    x: Math.random() * width,
    y: Math.random() * height
  };
  points.push(firstPoint);
  grid[gridIndex(firstPoint.x, firstPoint.y)] = firstPoint;

  const active = [firstPoint];

  while (active.length > 0) {
    const randomIndex = Math.floor(Math.random() * active.length);
    const point = active[randomIndex];

    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minDist * (1 + Math.random());
      const newX = point.x + Math.cos(angle) * radius;
      const newY = point.y + Math.sin(angle) * radius;

      if (isValidPoint(newX, newY)) {
        const newPoint = { x: newX, y: newY };
        points.push(newPoint);
        grid[gridIndex(newX, newY)] = newPoint;
        active.push(newPoint);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(randomIndex, 1);
    }
  }

  return points;
};
