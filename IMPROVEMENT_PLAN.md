# minipix Improvement Plan

Generated from a 70-agent review (6 dimensions, adversarially verified). The `renderers-worker` dimension stalled, so worker-renderer findings are limited to what surfaced via the `workers` and `utils` reviews.

**Stats:** 60 findings surveyed · 53 verified valid · 7 rejected · 30 renderer ideas (→ 10 picked)

---

## 1. Bugs

### Worker pool — `src/workers/pool.js`
- **Terminated worker re-enters available pool** (`pool.js:44`) — on timeout/error the worker is removed from `this.workers`, but a late `onmessage` still runs `this.available.push(worker)`. The dead worker is handed to the next task, whose `postMessage` goes nowhere → another 30s hang. Guard: `if (this.workers.includes(worker)) { this.available.push(worker); ... }`.
- **Errored worker never terminated** (`pool.js:64-68`) — `onerror` splices from `this.workers` but never calls `worker.terminate()`, leaking a live OS thread per renderer exception. Add `worker.terminate()` in the `onerror` path.
- **`terminate()` leaks queued promises** (`pool.js:158-170`) — in-flight `callbacks` are rejected but `this.queue` is cleared without rejecting, so awaiters hang forever. Iterate `for (const t of this.queue) t.reject(...)` before clearing.
- **Unknown renderer name hangs 30s** (`render.worker.js:19`) — `if (renderers[rendererName])` silently drops unknown names; main thread waits the full `TASK_TIMEOUT_MS`. Add an `else` that posts `{id, error: 'Unknown renderer: ' + rendererName}` and handle it in `pool.js` `onmessage`.

### Halftone config crash — `src/renderers/config.js:61-64` + `halftone.js:183-386`
`halftoneBayer`, `halftoneClassicDots`, `halftoneFloydSteinberg`, `halftoneLines` are defined as `{}` but their renderers read `config.numColors.min`, `config.blockSize.max`, etc. → `TypeError` on every invocation. All four are in the random pool via `Object.keys(rendererConfig)`, so ~15% of canvases crash. Fix: have variants fall back to `rendererConfig.halftone` or populate the configs. (Better: see "halftone variants duplicate ~200 lines" below — refactor to `forcedMode` and this goes away.)

### Core
- **Stale canvas after toggling images** (`Canvas.jsx:38`, `App.jsx:177`) — React key is `${seed}-${index}` (seed is index-derived), so toggling an image changes the `image` prop but reuses the component. The render effect re-runs but `isRendered` is still `true`, so the guard short-circuits and the old artwork stays. Fix: include `img.id` in the key, or reset `isRendered` when `image`/`renderFn`/`seed` change.
- **Cannot re-select same file** (`App.jsx:70-73`) — `handleFileChange` never clears the input value, so picking the same file again doesn't fire `onChange`. Fix: `event.target.value = ''` after `loadFiles()`.
- **Invalid ARIA grid** (`App.jsx:172-177`) — `role="grid"` → `role="gridcell"` with no `role="row"` wrapper violates WAI-ARIA required-context. This is a CSS layout, not a data grid. Fix: use `role="list"` / `role="listitem"` or drop roles.

### Utils
- **`extractDominantColors` returns NaN** (`utils/image.js:168-211`) — splitting a 1-pixel bucket yields `[[], [pixel]]`; the empty bucket averages to `{r:NaN, g:NaN, b:NaN}`. Reachable with small images (e.g. 20×20 at sampleRate=10 → 4 samples vs numColors up to 6). Fix: skip/break when largest bucket has `length <= 1`, filter empties before averaging.
- **Floyd-Steinberg error clamped** (`utils/image.js:281-336`) — diffused error is written back into the `Uint8ClampedArray`, truncating fractions and clamping out-of-range, which destroys the diffusion. The comment at L280 says "create error buffer" but none exists. Fix: accumulate in a `Float32Array(w*h*3)` like the worker's Atkinson impl.

---

## 2. Performance

- **`memo(Canvas)` defeated by inline object** (`App.jsx:183`) — `downloadMeta={{img, rendererName, hash, index}}` is a fresh object every render, so every infinite-scroll increment re-renders all existing canvases. Fix: pass primitives (`rendererName`, `hash`, `index`, `filename`) directly.
- **renderQueue sized by CPU cores** (`renderQueue.js:5`) — `Math.max(4, hardwareConcurrency)` gates *main-thread* sync renderers, where parallelism doesn't exist. On 16-core machines, 16 heavy canvas renders fire back-to-back per idle window. Fix: fixed `const maxConcurrent = 2` or `3`.
- **Unmounted canvases drain renderQueue** (`Canvas.jsx:63-75`) — cleanup only flips `cancelled`; the queued entry stays. After deep scroll + image toggle, hundreds of dead entries must each acquire a slot + `requestIdleCallback` before new renders start. Fix: `renderQueue.request` returns a cancel fn that splices from `waiting`.
- **No worker cancellation** (`pool.js:144-156`) — `render()` returns a bare promise. Fast scroll past worker-rendered canvases floods the queue with off-screen jobs. Fix: return `{promise, cancel}`; `cancel()` splices from `this.queue` if not started.
- **Full-image copy on worker result** (`createWorkerRenderer.js:26-28`) — `createImageData()` + `.data.set()` allocates + copies w×h×4 bytes unnecessarily. Fix: `ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0)`.
- **`scooch`: per-pixel JS loop for a blit** (`scooch.js:58-88`) — up to 8 iterations × W×H×4 array writes on main thread for a wrap-shift that is two `drawImage` calls. Further: N alternating shifts collapse to one net `(Σdx mod w, Σdy mod h)` → 4 `drawImage` quadrants total (`scooch.js:39-94`).
- **`crosshatch`: millions of `stroke()` calls** (`crosshatch.js:102-111`) — `beginPath`/`stroke` per line. Batch by palette color → ≤6 `stroke()` calls total.
- **`sqrt` in hot color-distance** (`utils/image.js:80-106`) — `findNearestColor` only compares for min; squared distance preserves ordering. Runs W×H×paletteSize. Worker already uses squared.
- **`maxRadiusSq` recomputed per pixel** (`workers/renderers/ripple.js:67`) — loop-invariant, hoist above the pixel loops.

---

## 3. Code quality / simplification

### Renderer boilerplate
- **Sync renderer preamble duplicated 16×** — every sync renderer repeats `if (!image) return; ctx = getContext; canvas.width/height = image.*; clearRect; random = createSeededRandom(seed); ctx.save()`. Extract `setupRenderer(canvas, image, seed) → {ctx, random}` in `utils/canvas.js`.
- **Worker renderer preamble duplicated 12×** — every worker renderer opens with `const random = createSeededRandom(seed); const outputData = new Uint8ClampedArray(imageData.length)`. Create these in `render.worker.js` and pass in: `renderers[name]({imageData, width, height, config, random, outputData})`.
- **`clearRect` after canvas resize is a no-op** — 17 occurrences. Setting `canvas.width` resets the bitmap per spec. Delete them all (or fold into the setup helper).
- **Outer `ctx.save()`/`ctx.restore()` is a no-op** — canvas was just resized (state reset), each canvas renders once. Delete from all sync renderers; keep only inner per-iteration pairs where transforms stack.
- **`map(random(), 0, 1, config.X.min, config.X.max)` repeated 40+×** — add `randFloat(range, rnd)` / `randInt(range, rnd)` taking `{min, max}` objects directly.

### Halftone
- **4 halftone variants duplicate ~240 lines** (`halftone.js:162-402`) — each copy-pastes setup + a `case` body. Refactor main `halftone` to accept `forcedMode`, define variants as one-liners. Fixes the config crash for free.
- **`shape = "circle"` hardcoded** (`halftone.js:80, 247`) → `drawHalftoneDot` square/diamond branches unreachable (`utils/canvas.js:61-87`). Either randomize shape or delete the branches + param.

### Dead code
- **`applyRandomFlip`** (`utils/canvas.js:11-21`) — zero importers.
- **`.canvas-loading` + `@keyframes ellipsis`** (`App.scss:215-258`) — no JSX renders this class.
- **No-op mobile media query** (`App.scss:90-93`) — sets identical values to base.
- **`kaleidoscope` `if (sqrCount === 0)`** (`kaleidoscope.js:58-60`) — `sqrCount ≥ 4` always.
- **`glitch` `shiftedIdx >= 0`** (`glitch.js:59`) — always true since `shiftAmount ∈ [5,30]`. Either remove check or restore bidirectional shift (`× (random() < 0.5 ? -1 : 1)`).
- **Barrel leaks internals** (`utils/index.js`) — `mulberry32`, `BAYER_4X4`, `colorDistance` re-exported but never imported outside `utils/`. `createSeededRandom` is a one-line pass-through to `mulberry32`.

### Other
- **Render error → permanent skeleton** (`Canvas.jsx:50-52`) — catch only logs; `isRendered` stays false so skeleton shows forever. Add error state or `finally { setIsRendered(true) }`.
- **`?renderer=` accepts non-functions** (`App.jsx:63-66`) — `?renderer=rendererConfig` passes `.filter(Boolean)`. Use `.filter(r => typeof r === 'function')`.
- **Drag overlay for non-file drags** (`useDragAndDrop.js:9-13`) — dragging text/links triggers full-screen overlay. Guard: `if (!e.dataTransfer?.types.includes('Files')) return`.
- **`handleDownload` wrapper redundant** (`App.jsx:107`) — `useCallback` around module-level `downloadCanvas` adds nothing. Pass `downloadCanvas` directly.
- **Renderer throw nukes whole worker** (`render.worker.js:17-23`) — no try/catch → global `onerror` → pool discards healthy worker. Wrap in try/catch, post `{id, error}`, return worker to pool.
- **`crosshatch` blockCache two-pass pointless** (`crosshatch.js:60-114`) — cache written once, read once, in lockstep, no neighbor lookups; `avgColor` stored but never read. Merge to single pass.
- **`radialBlur` washes out to ~37% white** (`radialBlur.js:13-14, 45`) — N layers at `alpha=1/N` over white → `(1-1/N)^N ≈ 37%` white residue. Draw first sample at `alpha=1`, or drop the white fill.
- **Duplicated palette/nearest-color logic** (`workers/renderers/dither.js:9-60` vs `utils/image.js`) — two algorithms (k-means vs median-cut), two data shapes (`[r,g,b]` vs `{r,g,b}`). Pick one.

---

## 4. Top 10 new renderers

| Name | Type | Difficulty | Pitch |
|---|---|---|---|
| **voronoiShatter** | worker | medium | Scatter N seeded points, compute Voronoi, fill each cell with avg image color. Stained-glass / shattered-crystal mosaic with optional 1-2px gaps. |
| **lowPoly** | sync | medium | Scatter points (denser at Sobel edges), Delaunay triangulate, fill each triangle with centroid color. Classic faceted low-poly portrait. |
| **truchet** | sync | easy | Grid of quarter-circle arc tiles, rotation chosen by cell luminance, arc colored by sampled pixel. Adjacent arcs connect into maze-like ribbons that reveal tonal structure. |
| **weave** | sync | medium | Horizontal + vertical image ribbons composited in alternating over-under basket-weave with clip rects + subtle shadow at crossings. |
| **flowField** | sync | hard | Seeded Perlin vector field; thousands of particles draw curved polylines in their start-pixel color. Swirling painterly smear. |
| **risograph** | worker | medium | 2-4 spot-ink layers (fluorescent pink/blue/yellow) with grain, misregistration, and multiply blend. Colored halos where layers don't align. |
| **neonEdge** | worker | medium | Sobel edge map → threshold → colorize 1-3 neon hues by angle → dilate + additive blur for glow, over 10-30% darkened original. TRON/synthwave. |
| **asciiMosaic** | sync | medium | Monospace character grid; per cell, luminance → density-ramp glyph (`' .:-=+*#%@'`) in cell's dominant color on dark bg. Seed picks charset (ascii/blocks/braille). |
| **lightLeak** | sync | easy | 1-4 seeded radial/linear gradients (warm orange/magenta) from edge anchors, `screen`/`lighter` blend. Analog camera light leak. |
| **contour** | sync | hard | Luminance as heightfield, marching-squares iso-lines at N thresholds, stroke each level in palette gradient. Topographic map of the photo. |

Honorable mentions: `lensArray` (insect-eye fisheye grid), `circlePacking` (Ishihara bubbles), `photocopy` (Nth-gen Xerox), `byteShift` (raw buffer misinterpretation datamosh), `bokeh` (aperture-shaped highlights).

---

## 5. UX features (ranked by impact/effort)

1. **Renderer name badge on hover** (`Canvas.jsx`, ~30 lines) — `downloadMeta.rendererName` and `hash` are already passed in. Fade in `.canvas__badge` bottom-left on hover/focus showing `{rendererName} · {hash}`.
2. **Copy image to clipboard** (`App.jsx`, ~20 lines) — `canvas.toBlob(b => navigator.clipboard.write([new ClipboardItem({'image/png': b})]))`. Icon in hover action bar.
3. **Renderer filter UI** (`App.jsx`, 1-2 days) — surface the hidden `?renderer=` param as a pill row in `.nav`, same pattern as image thumbnails. Sync to URL via `history.replaceState`.
4. **"More like this"** (`Canvas.jsx`, ½ day) — hover button → `onFocusRenderer(name)` → App filters to that renderer + `resetScroll()` + push `?renderer=name`.
5. **Per-canvas reroll** (`App.jsx`, 1 day) — ↻ button per canvas → `seedOverrides: {[index]: seed}` state. `canvasAssignments` checks overrides first.
6. **Pin/favorite shelf** (`App.jsx`, 1-2 days) — ♡ pushes `{imageId, rendererName, seed}` to `favorites` (localStorage). Render as pinned row above grid.
7. **Remove image from pool** (`useImageLoader.js`, ½ day) — `removeImage(id)` filters both arrays + `URL.revokeObjectURL`. × on thumbnail hover.
8. **Empty-state hero** (`App.jsx`, ½ day) — centered dashed dropzone + copy when `availableImages.length === 0`.
9. **Roving-tabindex keyboard nav** (`App.jsx`, 1 day) — only focused cell has `tabIndex=0`; arrow keys move, Enter downloads. Fixes the ARIA `role="grid"` contract.

---

## 6. Quick wins (<30 min each, do first)

- `App.jsx:73` — add `event.target.value = ''` after `loadFiles()`
- `App.jsx:66` — `.filter(Boolean)` → `.filter(r => typeof r === 'function')`
- `App.jsx:107` — delete `handleDownload` wrapper, pass `downloadCanvas` directly
- `App.jsx:172,177` — `role="grid"`/`"gridcell"` → `"list"`/`"listitem"`
- `pool.js:44` — guard re-pool with `if (this.workers.includes(worker))`
- `pool.js:67` — add `worker.terminate()` in `onerror` path
- `pool.js:167` — reject queued tasks before clearing in `terminate()`
- `render.worker.js:19` — add `else` posting `{id, error}` for unknown renderer
- `renderQueue.js:5` — `Math.max(4, hardwareConcurrency)` → `3`
- `createWorkerRenderer.js:26-28` — `new ImageData(result.data, w, h)` instead of create+set
- `ripple.js:67` — hoist `maxRadiusSq` above pixel loops
- `utils/image.js:80` — drop `sqrt` in `colorDistance`
- All renderers — delete `clearRect` after canvas resize, delete outer `save`/`restore`
- `utils/canvas.js:11-21` — delete `applyRandomFlip`
- `App.scss:90-93, 215-258` — delete no-op media query + `.canvas-loading` + `@keyframes ellipsis`
- `kaleidoscope.js:58-60` — delete `if (sqrCount === 0)` branch
- `glitch.js:59` — remove dead `>= 0` check (or make `shiftAmount` signed)
- `useDragAndDrop.js:9` — guard `if (!e.dataTransfer?.types.includes('Files')) return`
- `Canvas.jsx:50-52` — add `finally { setIsRendered(true) }` or error state

---

## Gap note

The `renderers-worker` survey dimension stalled (6 retries, all timed out), so the 12 worker renderers (`crt`, `dither`, `duotone`, `filmGrain`, `oilPaint`, `pixelSort`, `posterize`, `ripple`, `sketch`, `spiral`, `vhs`, `waves`) were only covered incidentally via the `workers` and `utils` reviews. A targeted pass on those files is still owed.
