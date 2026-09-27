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

// Random integer in a { min, max } range (inclusive).
export function randInt(range, randomFn = Math.random) {
  return Math.floor(randomFn() * (range.max - range.min + 1)) + range.min;
}

// Random float in a { min, max } range.
export function randFloat(range, randomFn = Math.random) {
  return randomFn() * (range.max - range.min) + range.min;
}

// Remaps value from [start1, stop1] to [start2, stop2].
export function map(value, start1, stop1, start2, stop2) {
  if (stop1 === start1) return start2;
  return ((value - start1) * (stop2 - start2)) / (stop1 - start1) + start2;
}
