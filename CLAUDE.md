This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

Minipix is a generative art tool that:

- Accepts multiple image uploads (PNG/JPEG) via file picker or drag-and-drop
- Presents a single-canvas studio (after the brand-shader study in ~/code/research-monorepo):
  one large output on a stage, a filmstrip of recent variations, and a stepped control panel
- Lets users pick source and renderer, reroll variations, and pin individual renderer parameters
- Uses seeded randomness for reproducible artwork
- Supports downloading/copying the output with descriptive filenames including its variation code,
  and copying a link that reproduces it
- Includes a Node CLI (`npm run render`) for batch rendering with node-canvas

## Project Structure

```
src/
├── main.jsx                       # React entry point (StrictMode + ErrorBoundary)
├── App.jsx                        # Studio: stage, filmstrip history, stepped panel, keyboard shortcuts
├── App.scss                       # Studio styles (scss/base.scss holds shared tokens + controls)
├── catalog.js                     # Renderer groups + descriptions, parameter specs, buildConfig
├── Canvas.jsx                     # Canvas component - render lifecycle, fit sizing
├── ErrorBoundary.jsx              # Top-level error boundary
├── components/
│   ├── controls.jsx               # Field, CodeInput
│   └── icons.jsx                  # The few Lucide icons the app uses, copied in (ISC)
├── hooks/
│   ├── useImageLoader.js          # Example images + uploads, in a stable order
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
│   └── renderers/
│       ├── index.js               # name → worker renderer map (worker entry + CLI)
│       └── <name>.js              # One file per worker (pixel-loop) renderer
├── utils/
│   ├── index.js                   # Barrel for renderer utilities
│   ├── math.js                    # createSeededRandom (Mulberry32), randInt, randFloat, recordDraws, map
│   ├── canvas.js                  # setupRenderer, calculateAdaptivePixelSize, drawHalftoneDot
│   ├── image.js                   # Color extraction, luminance, dithering, block averaging, color ramps
│   ├── noise.js                   # Seeded 2D gradient noise (shared with workers and CLI)
│   ├── blur.js                    # In-place running-sum box blur for float planes
│   ├── field.js                   # Low-res analysis: downsample, orientation field, saliency, blob finder
│   ├── download.js                # Seed hash/parsing + filenames (pure), download/copy (browser only)
│   └── output.js                  # ALL_RENDERERS, describe(), URL param readers, shareLink (browser only)
└── scss/
    ├── base.scss                  # Design tokens + shared control styles (imported before App.scss)
    └── modern-reset.scss

scripts/
├── render.js                      # CLI entry (`npm run render -- --file=...`), node-canvas
├── bench.js                       # Renderer benchmark + pixel-hash determinism check (`npm run bench`)
└── cli-renderers.js               # Imports renderer modules directly for Node use

bench/baseline-{train,test}.json   # Recorded pixel hashes + timings per (renderer, image, seed)
.githooks/pre-commit               # Renderer hash check (enabled by `npm install` via "prepare")
```

## Architecture

### App.jsx (Studio)

- Layout: `.studio__stage` (the well with one fitted `<Canvas>`, the filmstrip, a hint line)
  and `.studio__panel` with numbered steps: Source (thumbnail row + upload tile), Renderer,
  Variation (Reroll + parameters), Export (with the variation code)
- The edited variation is a draft `{ imageId, renderer, seed, overrides }`; the stage renders
  it after a short debounce, and it joins the 12-slot filmstrip history once it settles.
  Filmstrip thumbnails are downscaled snapshots of the finished stage canvas
- Seeds are plumbing: the UI never says "seed". Users see a variation *code*
  (`variationCode` / `parseVariationCode` in catalog.js): the seed hash plus one `-index.step`
  entry per pinned parameter. Filenames, Copy link (`?seed=<code>`) and the Export field's
  `CodeInput` all use it, so the code always describes the exact image, pins included
- Renderer step: grouped picker (alphabetical within each group) plus a dice button for a
  random different renderer. Changing renderer always rolls a new seed
- Variation step: Reroll (new seed; pinned parameters stay), then the parameter rows. Rows
  show what the current seed drew (`drawn`, from `recordDraws`) with a dimmed thumb; on auto
  before a render reports back, the range and no thumb. Each row has a dice button (shown
  on hover/focus) that pins it to `randomParamValue(spec)` (UI-only Math.random).
  Probability params are an Auto / On / Off switch (pins 1 or 0). Labels and % formatting
  come from the spec (`label`, `percent` for *Percent keys, which are fractions of image size)
- Icons are Lucide SVGs copied into `components/icons.jsx` (ISC; no icon package)
- Parameters: `catalog.js` turns each `rendererConfig` entry into slider specs. Untouched
  params stay "auto" (original random range); moving a slider pins it as `{ min: v, max: v }`,
  which is passed to the renderer via `<Canvas config>`. Pins are remembered per renderer.
  Pinning only narrows ranges — the RNG call order is unchanged, so unpinned output matches
- Keyboard: R reroll, D download, ←/→ step through the filmstrip
- Download filenames built with `buildFilename` from `utils/download.js`:
  `{originalname}-minipix-{renderer}-{code}.{ext}`

**Query Parameters:**
- `renderer`: Initial renderer (first valid name of a comma-separated list); otherwise random.
- `seed`: Initial variation: a code (seed hash + pins) from a filename or link, or a decimal
  seed. Copy link produces `?renderer=<name>&seed=<code>`.

### Canvas.jsx

- Renders one output: `renderFn`, `image`, `seed`, `config` (optional override, memoize it),
  `label` (aria), `maxWidth`/`maxHeight` (fit box, never upscales), `onRendered`
- Sync renderers start inside `requestIdleCallback` (cancelled if settings change first);
  worker renderers start immediately and cancel via the pool's `cancel()`
- Tracks `pending | done | error` render state for skeleton/error UI
- `onRendered(canvasEl, draws)` hands the finished canvas to App for export and filmstrip
  snapshots, plus the parameter values the render drew: sync renderers run inside
  `recordDraws`; worker renderers record in the worker and resolve with them

### Renderers

Each renderer lives in its own file and is re-exported from `src/renderers/index.js`.

**Sync (main-thread) renderers** in `src/renderers/`: arrowField, asciiMosaic, barSwap,
circlePacking, crosshatch, echo, glitch, gridSwap, halftone (plus CLI-only forced-mode
variants halftoneBayer, halftoneClassicDots, halftoneFloydSteinberg, halftoneLines), kaleidoscope,
lightLeak, lowPoly, pixelated, radialBlur, scooch, smear, stacked, stackedCircle,
subdivision.

**Worker-based (async) renderers** in `src/workers/renderers/`: angularBlur, barShift,
bokehBlur, bulge, chalkboard, channelBlur, chromaticAberration, compression, concentricSpin,
contourLines, crt, dataMosh, diffuseBlur, dither, duotone, emboss, engraving, filmGrain,
flutedGlass, glassTiles, glow, gradientMap, lensDistortion, melt, mirror, motionMask, neonEdge,
oilPaint, paperPrint, photocopy, pixelSort, polar, posterize, ripple, risograph, sketch,
solarize, spiral, tiltShift, velocityBlur, vhs, watercolor, waves. The browser-facing wrappers are
created in `src/renderers/index.js` via `createWorkerRenderer(name)`.

**"Motion"-inspired renderers** (after Maxime Heckel's *Shading Motion*) treat the still
image the way that article treats video: `arrowField` uses a structure-tensor orientation
field as a stand-in for optical flow, `motionMask` frame-differences the image against
shifted copies of itself, and `velocityBlur`/`smear`/`echo` blur or stack the image along
synthetic velocity trajectories (`velocityBlur`'s "blobs" mode uses `findBlobs` to pick
moving regions).

**Ports from shader-effects-inc/shaders** (MIT, WebGPU) re-implement that library's
image effects as CPU pixel loops with seeded parameters: the blurs (angularBlur, bokehBlur,
channelBlur, tiltShift, diffuseBlur), distortions (bulge, concentricSpin, polar, mirror,
flutedGlass, glassTiles, lensDistortion, chromaticAberration, barShift, dataMosh), drawn looks
(engraving, contourLines, chalkboard, watercolor, emboss) and colour treatments (compression,
glow, solarize, gradientMap, paperPrint).

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

- `math.js`: `createSeededRandom` (Mulberry32), `randomNumber(min, max, randomFn)`,
  `randInt(range, randomFn)`, `randFloat(range, randomFn)`, `map(...)` — shared with workers and CLI.
  `recordDraws(config, render)` reports what `randInt`/`randFloat` drew from each config range
  (null if drawn more than once); observing only, so output is unchanged. Use
  `randInt(config.x, random)` rather than `randomNumber(config.x.min, ...)` so draws are recorded
- `image.js`: `extractDominantColors` (median cut), `getLuminance`, `findNearestColor`,
  `getAverageColorInBlock`, `shuffleArray`, Bayer and Floyd-Steinberg dithering,
  `COLOR_RAMPS` / `buildRampLUT` for heat-map style colouring
- `noise.js`: `createNoise2D(random)` (Perlin-style gradient noise; consumes 255 RNG calls
  when built)
- `blur.js`: `boxBlur(plane, w, h, r, tmp)`, in place; summation order is part of the
  output, so don't swap in another blur where byte-identical output matters
- `field.js`: `downsampleImage` (block-average to ≤N px), `computeOrientationField`
  (structure tensor → tangent/normal/coherence/strength), `computeSaliency`
  (edges/bright/dark/saturation/detail), `findBlobs` (mean-shift blob tracking on a weight
  map; consumes 3 RNG calls per blob), `fitSize`
- `canvas.js`: `setupRenderer`, `calculateAdaptivePixelSize`, `drawHalftoneDot`
- `download.js`: `generateSeedHash`, `parseSeed`, `buildFilename`, `downloadCanvas`,
  `copyCanvas` — the first three are pure (the CLI uses them); the rest touch the DOM, so
  never import this file from worker code
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

### Benchmark and hash check

- `npm run bench -- --split=train --check=bench/baseline-train.json` renders every renderer
  over fixed images and seeds, prints times, and exits 1 on any pixel-hash change.
  `--renderer=a,b` limits it; `--reps=N` takes the fastest of N runs.
- `--split=train` is the 1333px Earth image (+ a non-square crop), seeds 1-3;
  `--split=test` holds out the 3569px Peony image, seeds 101/202. For performance work,
  keep a change only if it is faster on BOTH splits by more than the noise (about ±15% per
  renderer); a train-only win is overfitting
- The pre-commit hook (`.githooks/pre-commit`) runs the train check once (~35s) when staged
  files can affect rendering (`src/renderers/`, `src/workers/`, the render utils in
  `src/utils/`, `scripts/bench.js`, `scripts/cli-renderers.js`, `bench/`), and does nothing
  for other commits. It skips if the optional `canvas` package is missing. It renders the
  staged snapshot (exported to a temp dir), so unstaged edits don't affect the result
- Intentional visual change: re-record in the same commit with
  `npm run bench -- --split=train --save=bench/baseline-train.json` (and `--split=test`
  with `bench/baseline-test.json`). After upgrading `canvas`, sync-renderer hashes may shift
  with no code change; check the output, then re-record

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
5. Give it a group and description in `src/catalog.js` (the renderer picker); list any
   integer ranges in `INT_PARAMS` there so their sliders step by 1

6. Record its hashes so the pre-commit hook guards it (`--save` merges into the file):
   `npm run bench -- --split=train --renderer=myRenderer --save=bench/baseline-train.json`
   and the same with `--split=test` / `bench/baseline-test.json`

### Worker-based renderers

For pixel-intensive renderers that loop through every pixel:

1. Add the config entry to `src/renderers/config.js`
2. Create `src/workers/renderers/<name>.js`:

   ```javascript
   export default function myRenderer({ imageData, width, height, config, random, outputData }) {
     // pixel manipulation writing into outputData
   }
   ```

3. Add it to the map in `src/workers/renderers/index.js` (the Web Worker and the CLI both
   read it; the CLI runs worker renderers synchronously)
4. Add `export const myRenderer = createWorkerRenderer("myRenderer");` to
   `src/renderers/index.js` (kept separate so the main bundle doesn't pull in pixel code)
5. Give it a group and description in `src/catalog.js` (plus `INT_PARAMS` for integer ranges)

6. Record its hashes so the pre-commit hook guards it (`--save` merges into the file):
   `npm run bench -- --split=train --renderer=myRenderer --save=bench/baseline-train.json`
   and the same with `--split=test` / `bench/baseline-test.json`
