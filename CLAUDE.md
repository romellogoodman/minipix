This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

Minipix is a generative art tool that:

- Accepts multiple image uploads (PNG/JPEG) via file picker or drag-and-drop
- Displays an infinite scroll grid of computational collages
- Randomly assigns uploaded images and rendering functions to each canvas
- Uses seeded randomness for reproducible artwork
- Allows toggling individual images on/off from the generation pool
- Supports downloading individual canvas outputs with descriptive filenames including seed hash
- Includes a Node CLI (`npm run render`) for batch rendering with node-canvas

## Project Structure

```
src/
├── main.jsx                       # React entry point (StrictMode + ErrorBoundary)
├── App.jsx                        # Main App component - upload UI, canvas assignments, grid
├── App.scss                       # App component styles
├── Canvas.jsx                     # Canvas component - lazy loading, render lifecycle, download
├── ErrorBoundary.jsx              # Top-level error boundary
├── renderQueue.js                 # Limits concurrent main-thread (sync) renders
├── hooks/
│   ├── useImageLoader.js          # Default + uploaded image loading, availability toggling
│   ├── useDragAndDrop.js          # Window-level drag-and-drop upload
│   └── useInfiniteScroll.js       # IntersectionObserver sentinel, 20 canvases per page
├── renderers/
│   ├── index.js                   # Barrel: exports all renderers + rendererConfig
│   ├── config.js                  # rendererConfig parameter ranges for every renderer
│   ├── createWorkerRenderer.js    # Factory wrapping worker renderers (+ source pixel cache)
│   └── <name>.js                  # One file per sync (main-thread) renderer
├── workers/
│   ├── pool.js                    # WorkerPool: on-demand workers, task queue, timeouts
│   ├── render.worker.js           # Web Worker entry: dispatches to worker renderers
│   ├── utils.js                   # Re-exports shared utils for the worker bundle
│   └── renderers/<name>.js        # One file per worker (pixel-loop) renderer
├── utils/
│   ├── index.js                   # Barrel for renderer utilities
│   ├── math.js                    # mulberry32/createSeededRandom, randInt, randFloat, map
│   ├── canvas.js                  # setupRenderer, calculateAdaptivePixelSize, drawHalftoneDot
│   ├── image.js                   # Color extraction, luminance, dithering, block averaging
│   └── download.js                # Seed hash, download filename, canvas download (browser only)
└── scss/modern-reset.scss

scripts/
├── render.js                      # CLI entry (`npm run render -- --file=...`), node-canvas
└── cli-renderers.js               # Imports renderer modules directly for Node use
```

## Architecture

### App.jsx

Main application component that manages:

- Image upload via hidden file input and drag-and-drop (`useImageLoader`, `useDragAndDrop`)
- Infinite scroll paging via `useInfiniteScroll` (20 canvases per page)
- A per-page-load `sessionSeed`; canvas assignments (image, renderer, seed) are derived
  deterministically from `sessionSeed ^ index`, so scrolling extends the grid without
  reshuffling already-rendered canvases
- Download filenames built with `buildFilename` from `utils/download.js`:
  `{originalname}-minipix-{renderer}-{hash}.{ext}`
- The renderer pool comes from `Object.keys(rendererConfig)` mapped to the barrel exports

**Query Parameters:**
- `renderer`: Specify renderer(s) by name (e.g., `?renderer=spiral` or `?renderer=ripple,waves,spiral`).
  Comma-separated list supported; invalid names fall back to the full pool.
- `seed`: Reproduce a shared artwork. Accepts the base36 hash from a filename or a decimal
  seed; applied to the first canvas only.

### Canvas.jsx

Reusable canvas component with performance optimizations:

- Accepts `renderFn`, `image`, `seed`, `rendererName`, `hash`, `filename`, `mimeType` props
- Lazy loads via IntersectionObserver (starts 100px before entering the viewport, then
  disconnects the observer once visible)
- Sync renderers go through `renderQueue` (max 3 concurrent) inside `requestIdleCallback`
  to avoid blocking scroll; async (worker) renderers bypass the queue
- Tracks `pending | done | error` render state for skeleton/error UI
- Click (or Enter/Space) downloads the canvas via `utils/download.js`

### Renderers

Each renderer lives in its own file and is re-exported from `src/renderers/index.js`.

**Sync (main-thread) renderers** in `src/renderers/`: asciiMosaic, barSwap, circlePacking,
crosshatch, glitch, gridSwap, halftone (plus forced-mode variants halftoneBayer,
halftoneClassicDots, halftoneFloydSteinberg, halftoneLines), kaleidoscope, lightLeak,
lowPoly, pixelated, radialBlur, scooch, stacked, stackedCircle, subdivision.

**Worker-based (async) renderers** in `src/workers/renderers/`: crt, dither, duotone,
filmGrain, melt, neonEdge, oilPaint, photocopy, pixelSort, posterize, ripple, risograph,
sketch, spiral, vhs, waves. The browser-facing wrappers are created in
`src/renderers/index.js` via `createWorkerRenderer(name)`.

**Renderer Configuration (`src/renderers/config.js`):**
- `rendererConfig` has one entry per renderer; its keys define the random selection pool
- Each entry holds configurable parameters, usually `{ min, max }` ranges

**Renderer Function Signatures:**
- Sync renderers: `({ canvas, image, seed = Date.now() }) => void`, with a
  `displayName` property used in filenames and badges
- Worker renderer modules: `({ imageData, width, height, config, random, outputData }) => void`,
  writing into the provided `outputData` buffer
- Worker wrappers have `renderer.isAsync = true`; the returned promise carries a
  `cancel()` for dequeueing unstarted work
- `setupRenderer(canvas, image, seed)` in `utils/canvas.js` does the shared sync setup
  (size canvas to image, create seeded RNG)
- Canvas dimensions are set to original image dimensions (preserves aspect ratio and resolution)

### workers/pool.js

Manages a pool of Web Workers for parallel rendering:

- Creates workers on-demand up to `navigator.hardwareConcurrency` (default 4)
- Reuses idle workers; queues tasks when all are busy
- 30s task timeout; errored/timed-out workers are terminated and replaced
- Pixel buffers move via transferable objects (zero-copy) in both directions

`createWorkerRenderer` caches each image's source pixels in a small LRU so repeat
renders of the same image copy a buffer instead of re-running `drawImage` +
`getImageData` (a slow GPU readback) on the main thread.

### utils/

- `math.js`: `mulberry32`/`createSeededRandom`, `randomNumber(min, max, randomFn)`,
  `randInt(range, randomFn)`, `randFloat(range, randomFn)`, `map(...)` — shared with workers and CLI
- `image.js`: `extractDominantColors` (median cut), `getLuminance`, `findNearestColor`,
  `getAverageColorInBlock`, `shuffleArray`, Bayer and Floyd-Steinberg dithering
- `canvas.js`: `setupRenderer`, `calculateAdaptivePixelSize`, `drawHalftoneDot`
- `download.js`: `generateSeedHash`, `buildFilename`, `downloadCanvas` — browser-only,
  do not import from worker or CLI code
- All randomness helpers accept an optional `randomFn` (defaults to `Math.random`)

## CSS/SCSS Conventions

- Use BEM (Block Element Modifier) naming methodology for CSS classes
- Follow the pattern: `.block__element--modifier`
- Key BEM blocks: `.nav`, `.canvas-grid`, `.canvas`
- Modifiers: `.nav__thumbnail--active`, `.nav__thumbnail--inactive`

## Seeded Randomness

Minipix uses seeded randomness to make artwork reproducible:

- Each canvas receives a unique random seed (0x00000000 to 0xFFFFFFFF)
- Seeds are converted to base36 hashes for filenames (`generateSeedHash`)
- Same seed + renderer = identical visual output every time — preserve this when
  optimizing renderer internals (keep the math and the RNG call order identical)
- Uses Mulberry32 PRNG for consistent cross-platform results

## Adding New Renderers

### Sync (main-thread) renderers

1. Add a config entry to `rendererConfig` in `src/renderers/config.js` (its presence
   enables the renderer in the random pool)
2. Create `src/renderers/<name>.js`:

   ```javascript
   import { setupRenderer, randInt } from "../utils/index.js";
   import { rendererConfig } from "./config.js";

   const myRenderer = ({ canvas, image, seed = Date.now() }) => {
     if (!image) return;
     const { ctx, random } = setupRenderer(canvas, image, seed);
     const config = rendererConfig.myRenderer;
     // Rendering logic using random() instead of Math.random()
   };

   myRenderer.displayName = "myRenderer";
   export default myRenderer;
   ```

3. Export it from `src/renderers/index.js` (keep exports alphabetical)
4. Add it to `scripts/cli-renderers.js` so the CLI can use it

### Worker-based renderers

For pixel-intensive renderers that loop through every pixel:

1. Add the config entry to `src/renderers/config.js`
2. Create `src/workers/renderers/<name>.js`:

   ```javascript
   export default function myRenderer({ imageData, width, height, config, random, outputData }) {
     // pixel manipulation writing into outputData
   }
   ```

3. Register it in the `renderers` map in `src/workers/render.worker.js`
4. Add `export const myRenderer = createWorkerRenderer("myRenderer");` to
   `src/renderers/index.js`
5. Add it to `scripts/cli-renderers.js` (worker renderers run synchronously there)
