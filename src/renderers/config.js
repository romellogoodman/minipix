// Renderer configuration
export const rendererConfig = {
  barSwap: {
    numBars: { min: 4, max: 50 },
  },
  crosshatch: {
    numColors: { min: 3, max: 6 },
    lineSpacing: { min: 3, max: 12 },
    lineLength: { min: 8, max: 25 },
    strokeWidth: { min: 1, max: 3 },
  },
  crt: {
    scanlineIntensity: { min: 0.1, max: 0.5 },
    scanlineCount: { min: 100, max: 400 },
    brightness: { min: 1.0, max: 1.3 },
    contrast: { min: 1.0, max: 1.2 },
    saturation: { min: 1.0, max: 1.3 },
    bloomIntensity: { min: 0.1, max: 0.4 },
    bloomRadius: { min: 2, max: 6 },
    rgbShift: { min: 1, max: 4 },
    vignetteStrength: { min: 0.2, max: 0.5 },
    curvature: { min: 0.05, max: 0.2 },
  },
  dither: {
    numColors: { min: 2, max: 6 },
    blueNoiseScale: { min: 32, max: 128 },
    bayerSize: { min: 3, max: 4 }, // 2^n matrix size (3=8x8, 4=16x16)
  },
  duotone: {
    hueShift: { min: 0, max: 360 },
    saturationBoost: { min: 0.8, max: 1.2 },
  },
  filmGrain: {
    grainIntensity: { min: 0.1, max: 0.5 },
    tintStrength: { min: 0.1, max: 0.6 },
    contrast: { min: 0.9, max: 1.3 },
    vignette: { min: 0.2, max: 0.6 },
    scratchCount: { min: 0, max: 20 },
  },
  glitch: {
    numSlices: { min: 5, max: 30 },
    maxOffset: { min: 0.02, max: 0.15 },
    colorShiftProbability: 0.3,
    colorShiftAmount: { min: 5, max: 30 },
    invertProbability: 0.5,
  },
  gridSwap: {
    baseGridSize: { min: 2, max: 20 },
    extraGridCells: { min: 1, max: 3 },
  },
  halftone: {
    numColors: { min: 2, max: 6 },
    classicDots: {
      blockSize: { min: 1, max: 16 },
    },
    lines: {
      blockSize: { min: 1, max: 16 },
      lineWeightMultiplier: 1,
    },
  },
  kaleidoscope: {
    squareCount: { min: 2, max: 20 },
    sourceOffsetPercent: { min: 0, max: 1 }, // where to sample from in non-square images
    fillCanvasProbability: 0.5, // chance to stretch to fill vs maintain square
  },
  oilPaint: {
    radius: { min: 3, max: 6 },
    levels: { min: 4, max: 10 },
    saturation: { min: 1.2, max: 1.6 },
  },
  pixelated: {},
  pixelSort: {
    threshold: { min: 0.05, max: 0.4 },
    sortLength: { min: 0.6, max: 1.0 },
    reverseProbability: 0.5,
  },
  posterize: {
    levels: { min: 2, max: 8 },
  },
  radialBlur: {
    numSamples: { min: 10, max: 60 },
    blurStrength: { min: 0.02, max: 0.6 },
    centerVariation: { min: 0.2, max: 0.8 },
  },
  ripple: {
    numRipples: { min: 1, max: 4 },
    amplitudePercent: { min: 0.02, max: 0.07 }, // percentage of smaller dimension
    singleRippleAmplitudePercent: 0.05, // fixed amplitude when only 1 ripple
    frequency: { min: 0.03, max: 0.12 },
  },
  scooch: {
    numScooches: { min: 1, max: 8 },
    scoochPercent: { min: 0.05, max: 0.5 },
  },
  sketch: {
    lineThickness: { min: 1, max: 3 },
    edgeThreshold: { min: 30, max: 100 },
    hatchingDensity: { min: 2, max: 6 },
  },
  spiral: {
    spiralStrength: { min: 0.1, max: 5 },
    oscillationFrequency: { min: 0.0025, max: 0.03 },
    oscillationProbability: 0.5, // chance to oscillate vs one-direction twist
  },
  stacked: {
    numStacks: { min: 2, max: 20 },
    sizeFactor: { min: 0.2, max: 1 },
  },
  stackedCircle: {
    numStacks: { min: 4, max: 20 },
    sizeFactor: { min: 0.2, max: 1 },
    rotation: { min: -180, max: 180 },
  },
  subdivision: {
    maxDepth: { min: 3, max: 5 },
    skipProbability: { min: 0.3, max: 0.6 },
    splitPercent: { min: 0.3, max: 0.7 },
    minSize: 10,
  },
  vhs: {
    trackingNoise: { min: 0.02, max: 0.1 },
    colorBleed: { min: 2, max: 10 },
    wobble: { min: 1, max: 5 },
    noiseIntensity: { min: 0.05, max: 0.2 },
  },
  waves: {
    numWaves: { min: 20, max: 200 },
    amplitude: { min: 5, max: 100 },
    frequency: { min: 0.005, max: 0.05 },
  },
};
