import createWorkerRenderer from "./createWorkerRenderer.js";

export { rendererConfig } from "./config.js";

// Sync (main-thread) renderers
export { default as barSwap } from "./barSwap.js";
export { default as crosshatch } from "./crosshatch.js";
export { default as glitch } from "./glitch.js";
export { default as gridSwap } from "./gridSwap.js";
export { default as halftone, halftoneBayer, halftoneClassicDots, halftoneFloydSteinberg, halftoneLines } from "./halftone.js";
export { default as kaleidoscope } from "./kaleidoscope.js";
export { default as pixelated } from "./pixelated.js";
export { default as radialBlur } from "./radialBlur.js";
export { default as scooch } from "./scooch.js";
export { default as stacked } from "./stacked.js";
export { default as stackedCircle } from "./stackedCircle.js";
export { default as subdivision } from "./subdivision.js";

// Async (worker-backed) renderers
export const crt = createWorkerRenderer("crt");
export const dither = createWorkerRenderer("dither");
export const duotone = createWorkerRenderer("duotone");
export const filmGrain = createWorkerRenderer("filmGrain");
export const oilPaint = createWorkerRenderer("oilPaint");
export const pixelSort = createWorkerRenderer("pixelSort");
export const posterize = createWorkerRenderer("posterize");
export const ripple = createWorkerRenderer("ripple");
export const sketch = createWorkerRenderer("sketch");
export const spiral = createWorkerRenderer("spiral");
export const vhs = createWorkerRenderer("vhs");
export const waves = createWorkerRenderer("waves");
