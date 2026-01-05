// Shared utility functions for both main thread and Web Workers
// These are pure functions with no dependencies, safe for worker use

/**
 * Seeded pseudo-random number generator using Mulberry32 algorithm.
 * @param {number} seed - The seed value for the generator
 * @returns {function(): number} A function that returns random numbers between 0 and 1
 */
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a seeded random function from a seed value.
 * @param {number} seed - The seed value
 * @returns {function(): number} A seeded random function
 */
export function createSeededRandom(seed) {
  return mulberry32(seed);
}

/**
 * Generates a random integer between min and max (inclusive).
 * @param {number} min - The minimum value (inclusive)
 * @param {number} max - The maximum value (inclusive)
 * @param {function(): number} [randomFn=Math.random] - Optional random function to use
 * @returns {number} A random integer between min and max
 */
export function randomNumber(min, max, randomFn = Math.random) {
  return Math.floor(randomFn() * (max - min + 1)) + min;
}

/**
 * Remaps a number from one range to another range.
 * @param {number} value - The value to remap
 * @param {number} inMin - The lower bound of the input range
 * @param {number} inMax - The upper bound of the input range
 * @param {number} outMin - The lower bound of the output range
 * @param {number} outMax - The upper bound of the output range
 * @returns {number} The remapped value
 */
export function map(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
