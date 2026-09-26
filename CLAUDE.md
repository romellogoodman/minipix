This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

Minipix is a generative art tool that:

- Accepts multiple image uploads (PNG/JPEG) via file picker or drag-and-drop
- Presents a single-canvas studio (after the brand-shader study in ~/code/research-monorepo):
  one large output on a stage, a filmstrip of recent variations, and a stepped control panel
- Lets users pick source, renderer, and seed, and pin individual renderer parameters
- Uses seeded randomness for reproducible artwork
- Supports downloading/copying the output with descriptive filenames including seed hash,
  plus saving/loading settings as JSON
- Includes a Node CLI (`npm run render`) for batch rendering with node-canvas

Earlier grid-based layout explorations (baseline grid, contact sheet, board, matrix) are
preserved on the `ui-explorations` branch.

## Project Structure

```
src/
├── main.jsx                       # React entry point (StrictMode + ErrorBoundary)
├── App.jsx                        # Studio: stage, filmstrip history, stepped panel, keyboard shortcuts
├── App.scss                       # Studio styles (scss/base.scss holds shared tokens + controls)
├── catalog.js                     # Renderer groups + descriptions, parameter specs, buildConfig
├── Canvas.jsx                     # Canvas component - lazy loading, render lifecycle, fit sizing
├── ErrorBoundary.jsx              # Top-level error boundary
├── renderQueue.js                 # Limits concurrent main-thread (sync) renders
├── components/
│   └── controls.jsx               # Field, Select, DropZone, SeedInput
├── hooks/
│   ├── useImageLoader.js          # Default + uploaded image loading
│   ├── useDragAndDrop.js          # Window-level drag-and-drop upload
│   └── useExport.js               # download / copy image / copy link + status flash
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
│   ├── image.js                   # Color extraction, luminance, dithering, block averaging, color ramps
│   ├── noise.js                   # Seeded 2D gradient noise + fbm (shared with workers and CLI)
│   ├── field.js                   # Low-res analysis: downsample, orientation field, saliency, blob finder
│   ├── download.js                # Seed hash, seed parsing, filenames, download/copy (browser only)
│   └── output.js                  # ALL_RENDERERS, describe(), URL param readers, shareLink (browser only)
└── scss/
    ├── base.scss                  # Design tokens + shared control styles (imported before App.scss)
    └── modern-reset.scss

scripts/
├── render.js                      # CLI entry (`npm run render -- --file=...`), node-canvas
└── cli-renderers.js               # Imports renderer modules directly for Node use
```

## Architecture

### App.jsx (Studio)

- Layout: `.studio__stage` (the well with one fitted `<Canvas>`, the filmstrip, a hint line)
  and `.studio__panel` with numbered steps: Source (thumbnail row + upload tile), Renderer,
  Variation (seed + parameters), Export
- The edited variation is a draft `{ imageId, renderer, seed, overrides }`; the stage renders
  it after a short debounce, and it joins the 12-slot filmstrip history once it settles.
  Filmstrip thumbnails are downscaled snapshots of the finished stage canvas
- Variation step: seed, Reroll (new seed + clears all pins), Lock seed (when off, changing
  renderer rolls a new seed; when on, the seed is kept), then the parameter sliders
- Parameters: `catalog.js` turns each `rendererConfig` entry into slider specs. Untouched
  params stay "auto" (original random range); moving a slider pins it as `{ min: v, max: v }`,
  which is passed to the renderer via `<Canvas config>`. Pins are remembered per renderer.
  Pinning only narrows ranges — the RNG call order is unchanged, so unpinned output matches
- Save/Load settings: JSON with renderer, seed, image filename, and pins
- Keyboard: R reroll, D download, ←/→ step through the filmstrip
- Download filenames built with `buildFilename` from `utils/download.js`:
  `{originalname}-minipix-{renderer}-{hash}.{ext}`

**Query Parameters:**
- `renderer`: Initial renderer (first valid name of a comma-separated list); otherwise random.
- `seed`: Initial seed. Accepts the base36 hash from a filename or a decimal seed.
  Copy link produces `?renderer=<name>&seed=<hash>` (pinned parameters are not included).

### Canvas.jsx

Reusable canvas component with performance optimizations:

- Accepts `renderFn`, `image`, `seed`, `config` (optional override, memoize it), `rendererName`,
  `hash`, `maxWidth`/`maxHeight` (fit box, never upscales), `scrollRoot`, `onRendered` props
- Lazy loads via IntersectionObserver (starts 100px before entering the viewport, then
  disconnects the observer once visible)
- Sync renderers go through `renderQueue` (max 3 concurrent) inside `requestIdleCallback`
  to avoid blocking scroll; async (worker) renderers bypass the queue
- Tracks `pending | done | error` render state for skeleton/error UI
- `onRendered(canvasEl)` hands the finished canvas to App for export and filmstrip snapshots

### Renderers

Each renderer lives in its own file and is re-exported from `src/renderers/index.js`.

**Sync (main-thread) renderers** in `src/renderers/`: arrowField, asciiMosaic, barSwap,
circlePacking, crosshatch, echo, glitch, gridSwap, halftone (plus forced-mode variants
halftoneBayer, halftoneClassicDots, halftoneFloydSteinberg, halftoneLines), kaleidoscope,
lightLeak, lowPoly, pixelated, radialBlur, scooch, smear, stacked, stackedCircle,
subdivision.

**Worker-based (async) renderers** in `src/workers/renderers/`: crt, dither, duotone,
filmGrain, melt, motionMask, neonEdge, oilPaint, photocopy, pixelSort, posterize, ripple,
risograph, sketch, spiral, velocityBlur, vhs, waves. The browser-facing wrappers are
created in `src/renderers/index.js` via `createWorkerRenderer(name)`.

**"Motion"-inspired renderers** (after Maxime Heckel's *Shading Motion*) treat the still
image the way that article treats video: `arrowField` uses a structure-tensor orientation
field as a stand-in for optical flow, `motionMask` frame-differences the image against
shifted copies of itself, and `velocityBlur`/`smear`/`echo` blur or stack the image along
synthetic velocity trajectories (`velocityBlur`'s "blobs" mode uses `findBlobs` to pick
moving regions).

**Renderer Configuration (`src/renderers/config.js`):**
- `rendererConfig` has one entry per renderer; its keys define the random selection pool
- Each entry holds configurable parameters, usually `{ min, max }` ranges

**Renderer Function Signatures:**
- Sync renderers: `({ canvas, image, seed = Date.now(), config = rendererConfig.<name> }) => void`, with a
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
  `getAverageColorInBlock`, `shuffleArray`, Bayer and Floyd-Steinberg dithering,
  `COLOR_RAMPS` / `sampleRamp` / `buildRampLUT` for heat-map style colouring
- `noise.js`: `createNoise2D(random)` (Perlin-style gradient noise; consumes 255 RNG calls
  when built)
- `field.js`: `downsampleImage` (block-average to ≤N px), `computeOrientationField`
  (structure tensor → tangent/normal/coherence/strength), `computeSaliency`
  (edges/bright/dark/saturation/detail), `findBlobs` (mean-shift blob tracking on a weight
  map; consumes 3 RNG calls per blob), `sobel`, `boxBlurPlane`, `fitSize`
- `canvas.js`: `setupRenderer`, `calculateAdaptivePixelSize`, `drawHalftoneDot`
- `download.js`: `generateSeedHash`, `parseSeed`, `buildFilename`, `downloadCanvas`, `copyCanvas` — browser-only,
  do not import from worker or CLI code
- All randomness helpers accept an optional `randomFn` (defaults to `Math.random`)

## CSS/SCSS Conventions

- Use BEM (Block Element Modifier) naming methodology for CSS classes
- Follow the pattern: `.block__element--modifier`
- Key BEM blocks: `.app`, `.studio`, `.field`, `.select`, `.drop`, `.btn`, `.canvas`
- Design tokens (`--color-*`, `--spacing-*`, `--radius*`) live in `scss/base.scss` and mirror
  the brand-shader study

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

   const myRenderer = ({ canvas, image, seed = Date.now(), config = rendererConfig.myRenderer }) => {
     if (!image) return;
     const { ctx, random } = setupRenderer(canvas, image, seed);
     // Rendering logic using random() instead of Math.random()
   };

   myRenderer.displayName = "myRenderer";
   export default myRenderer;
   ```

3. Export it from `src/renderers/index.js` (keep exports alphabetical)
4. Add it to `scripts/cli-renderers.js` so the CLI can use it
5. Give it a group and description in `src/catalog.js` (the renderer picker)

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
6. Give it a group and description in `src/catalog.js`
