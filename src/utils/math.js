// Pure math shared by the main thread, Web Workers, and the Node CLI.

// Mulberry32 PRNG: returns a function yielding floats in [0, 1).
export function createSeededRandom(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random integer in [min, max].
export function randomNumber(min, max, randomFn = Math.random) {
  return Math.floor(randomFn() * (max - min + 1)) + min;
}

// Observer for recordDraws; null except while a recorded render is running.
let onDraw = null;

// Random integer in a { min, max } range (inclusive).
export function randInt(range, randomFn = Math.random) {
  const value = Math.floor(randomFn() * (range.max - range.min + 1)) + range.min;
  if (onDraw) onDraw(range, value);
  return value;
}

// Random float in a { min, max } range.
export function randFloat(range, randomFn = Math.random) {
  const value = randomFn() * (range.max - range.min) + range.min;
  if (onDraw) onDraw(range, value);
  return value;
}

// Runs a synchronous render and returns the value it drew from each { min, max }
// range in `config`, by key, so the UI can show what a seed actually picked.
// A range drawn more than once (e.g. once per shape) maps to null. Observing
// only: the RNG sequence and the output are unchanged.
export function recordDraws(config, render) {
  const keyOf = new Map();
  for (const [key, value] of Object.entries(config)) {
    if (value && typeof value === "object") keyOf.set(value, key);
  }
  const draws = {};
  onDraw = (range, value) => {
    const key = keyOf.get(range);
    if (key !== undefined) draws[key] = key in draws ? null : value;
  };
  try {
    render();
  } finally {
    onDraw = null;
  }
  return draws;
}

// Remaps value from [start1, stop1] to [start2, stop2].
export function map(value, start1, stop1, start2, stop2) {
  if (stop1 === start1) return start2;
  return ((value - start1) * (stop2 - start2)) / (stop1 - start1) + start2;
}
