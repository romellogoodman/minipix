This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

Minipix is a generative art tool that:

- Accepts multiple image uploads (PNG/JPEG)
- Displays an infinite scroll grid of computational collages
- Randomly assigns uploaded images and rendering functions to each canvas
- Uses seeded randomness for reproducible artwork
- Allows toggling individual images on/off from the generation pool
- Supports downloading individual canvas outputs with descriptive filenames including seed hash

## Project Structure

```
src/
├── main.jsx           # React entry point
├── App.jsx            # Main App component - handles image upload and grid layout
├── App.scss           # App component styles
├── Canvas.jsx         # Canvas component - renders individual canvases with lazy loading
├── renderers.js       # Rendering algorithms for image manipulation
├── render.worker.js   # Web Worker for pixel-intensive rendering operations
├── workerPool.js      # Worker pool manager for parallel rendering
└── utils.js           # Utility functions including seeded PRNG
```

## Architecture

### App.jsx

Main application component that manages:

- Image upload and state (`allImages`, `availableImages`)
- Image availability toggling via thumbnail interface
- Random image and renderer selection (or hardcoded via query parameter)
- Infinite scroll canvas grid rendering with 20 canvases per page
- Unique seed generation for each canvas (0xFFFFFFFF range)
- Canvas download functionality with descriptive filenames: `{originalname}-minipix-{renderer}-{hash}.{ext}`
- Filters enabled renderers using `rendererConfig` object

**Query Parameters:**
- `renderer`: Specify renderer(s) by name (e.g., `?renderer=spiral` or `?renderer=ripple,waves,spiral`)
  - Supports comma-separated list for multiple renderers
  - If invalid or not provided, random selection from all enabled renderers is used

### Canvas.jsx

Reusable canvas component with performance optimizations:

- Accepts `renderFn`, `image`, `seed`, and `onClick` props
- Implements lazy loading via IntersectionObserver
- Uses render queue to limit concurrent renders
- Supports both sync and async renderer functions
- Handles click events for canvas download

**Lazy Loading:**
```javascript
// Starts loading 100px before canvas enters viewport
const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) {
      setIsVisible(true);
    }
  },
  { rootMargin: "100px", threshold: 0.01 }
);
```

**Render Queue:**
- Limits concurrent renders to `Math.max(4, navigator.hardwareConcurrency)`
- Queues additional renders and processes them as slots free up
- Uses `requestIdleCallback` to avoid blocking scroll/UI

### renderers.js

Collection of rendering algorithms exported as named functions:

**Canvas-based renderers (sync):**
- `barSwap`: Shuffles horizontal or vertical bars
- `gridSwap`: Shuffles grid tiles with aspect-ratio adaptation
- `pixelated`: Adaptive block-based pixelation effect
- `scooch`: Wraps edge slice to opposite side
- `stacked`: Creates layered effect with 2-20 stacks at varying scales
- `stackedCircle`: Circular clipped stacks with optional rotation
- `subdivision`: Recursive fragmentation with binary space partitioning
- `halftone`: Multiple halftone modes (bayer, floyd-steinberg, classic dots, lines)
- `kaleidoscope`: Mirrored square grid effect
- `crosshatch`: Pen-stroke crosshatching based on luminance
- `glitch`: Horizontal slice displacement with color channel shifting
- `radialBlur`: Zoom blur effect from random center point

**Worker-based renderers (async):**
- `ripple`: Concentric wave distortion from random points
- `spiral`: Rotational twist effect (oscillating or one-direction)
- `waves`: Sinusoidal displacement (horizontal or vertical)

**Renderer Configuration:**
- `rendererConfig` object at the top of the file controls each renderer's parameters
- Each renderer entry includes configurable min/max ranges
- Example config structure:
  ```javascript
  export const rendererConfig = {
    barSwap: {
      numBars: { min: 4, max: 50 },
    },
    spiral: {
      spiralStrength: { min: 0.1, max: 5 },
      oscillationFrequency: { min: 0.0025, max: 0.03 },
      oscillationProbability: 0.5,
    },
    // ...
  };
  ```

**Renderer Function Signature:**
- Sync renderers: `({ canvas, image, seed = Date.now() }) => void`
- Async renderers: `async ({ canvas, image, seed = Date.now() }) => Promise<void>`
- Async renderers have `rendererName.isAsync = true` flag
- `seed` parameter controls all randomness within the renderer using seeded PRNG
- Canvas dimensions are set to original image dimensions (preserves aspect ratio and resolution)

### render.worker.js

Web Worker for pixel-intensive rendering operations:

- Runs pixel manipulation off the main thread
- Contains implementations for `ripple`, `spiral`, and `waves` renderers
- Receives ImageData buffer via transferable objects (zero-copy)
- Returns processed pixel buffer back to main thread

### workerPool.js

Manages a pool of Web Workers for parallel rendering:

- Creates workers on-demand up to `navigator.hardwareConcurrency` limit
- Reuses idle workers for subsequent renders
- Queues tasks when all workers are busy
- Uses transferable objects to avoid copying image data

**Usage:**
```javascript
const result = await workerPool.render(
  "ripple",           // renderer name
  sourceData.data,    // Uint8ClampedArray pixel data
  canvas.width,
  canvas.height,
  seed,
  rendererConfig.ripple
);
```

### utils.js

Utility functions for rendering:

- `mulberry32(seed)`: Mulberry32 PRNG implementation for seeded randomness
- `createSeededRandom(seed)`: Creates a seeded random function from a seed value
- `randomNumber(min, max, randomFn)`: Generates random integers with optional seeded random function
- `map(value, inMin, inMax, outMin, outMax)`: Linear interpolation/mapping
- `calculateAdaptivePixelSize(width, height, randomFn)`: Calculates pixelation block size
- `shuffleArray(array, randomFn)`: Fisher-Yates shuffle with optional seeded randomness
- `extractDominantColors(imageData, numColors, sampleStep)`: K-means color extraction
- `getLuminance(r, g, b)`: Calculate perceived brightness
- `findNearestColor(color, palette)`: Find closest palette match
- All functions accept optional `randomFn` parameter (defaults to `Math.random`)

## CSS/SCSS Conventions

- Use BEM (Block Element Modifier) naming methodology for CSS classes
- Follow the pattern: `.block__element--modifier`
- Key BEM blocks: `.nav`, `.canvas-grid`, `.canvas`
- Modifiers: `.nav__thumbnail--active`, `.nav__thumbnail--inactive`

## Seeded Randomness

Minipix uses seeded randomness to make artwork reproducible:

- Each canvas receives a unique random seed (0x00000000 to 0xFFFFFFFF)
- Seeds are converted to 6-character base36 hashes for filenames
- Same seed + renderer = identical visual output every time
- Seed controls only renderer's internal randomness (not image/renderer selection)
- Uses Mulberry32 PRNG algorithm for consistent cross-platform results

**Implementation:**
```javascript
// Generate seed in App.jsx
const seed = Math.floor(Math.random() * 0xFFFFFFFF);

// Create seeded random function in renderer
const random = createSeededRandom(seed);

// Use in place of Math.random()
const value = randomNumber(min, max, random);
```

## Adding New Renderers

To add a new rendering algorithm:

1. Add configuration entry to `rendererConfig` object at top of `renderers.js`:
   ```javascript
   rendererName: {
     parameterName: { min: value, max: value },
     // ... other configurable parameters
   }
   ```

2. Export a new renderer function in `renderers.js`:
   ```javascript
   export const rendererName = ({ canvas, image, seed = Date.now() }) => {
     if (!image) return;
     const ctx = canvas.getContext("2d");
     canvas.width = image.width;
     canvas.height = image.height;

     // Create seeded random function
     const random = createSeededRandom(seed);

     // Use config values
     const config = rendererConfig.rendererName;
     const paramValue = randomNumber(config.parameterName.min, config.parameterName.max, random);

     // Rendering logic using random() instead of Math.random()
   };
   ```

3. Keep renderers in alphabetical order by function name for easier navigation and maintenance

4. The function will automatically be included in the random selection pool

### Adding Worker-Based Renderers

For pixel-intensive renderers that loop through every pixel:

1. Add the pixel manipulation logic to `render.worker.js`:
   ```javascript
   const renderers = {
     // ... existing renderers
     newRenderer: (imageData, width, height, config, seed) => {
       const random = createSeededRandom(seed);
       const outputData = new Uint8ClampedArray(imageData.length);
       // ... pixel manipulation
       return outputData;
     },
   };
   ```

2. Create an async wrapper in `renderers.js`:
   ```javascript
   export const newRenderer = async ({ canvas, image, seed = Date.now() }) => {
     if (!image) return;
     const ctx = canvas.getContext("2d");
     canvas.width = image.width;
     canvas.height = image.height;
     ctx.drawImage(image, 0, 0);
     const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);

     const result = await workerPool.render(
       "newRenderer",
       sourceData.data,
       canvas.width,
       canvas.height,
       seed,
       rendererConfig.newRenderer
     );

     const outputData = ctx.createImageData(canvas.width, canvas.height);
     outputData.data.set(result.data);
     ctx.putImageData(outputData, 0, 0);
   };

   newRenderer.isAsync = true;
   ```

3. Add the renderer name to the `canOffload` check in `workerPool.js` if needed
