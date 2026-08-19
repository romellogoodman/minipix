// Renderer configuration
export const rendererConfig = {
  arrowField: {
    cols: { min: 24, max: 64 },
    darken: { min: 0.5, max: 0.85 },
    hueProbability: 0.5, // colour arrows by direction vs single accent
    tangentProbability: 0.5, // arrows along edges vs across them
  },
  asciiMosaic: {
    cols: { min: 60, max: 160 },
  },
  barSwap: {
    numBars: { min: 4, max: 50 },
  },
  circlePacking: {
    attempts: { min: 3000, max: 8000 },
    minRadiusPercent: 0.004,
    maxRadiusPercent: 0.06,
    padding: 1,
  },
  crosshatch: {
    numColors: { min: 3, max: 6 },
    lineSpacingPercent: { min: 0.004, max: 0.015 },
    lineLengthPercent: { min: 0.01, max: 0.03 },
  },
  crt: {
    scanlineIntensity: { min: 0.1, max: 0.5 },
    scanlineCount: { min: 100, max: 400 },
    brightness: { min: 1.0, max: 1.3 },
    contrast: { min: 1.0, max: 1.2 },
    saturation: { min: 1.0, max: 1.3 },
    bloomIntensity: { min: 0.1, max: 0.4 },
    bloomRadiusPercent: { min: 0.003, max: 0.008 },
    rgbShiftPercent: { min: 0.001, max: 0.005 },
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
  echo: {
    numCopies: { min: 3, max: 10 },
    stepPercent: { min: 0.01, max: 0.06 },
    rotationStep: { min: 1, max: 8 }, // degrees per copy
    scaleStep: { min: 0.01, max: 0.05 }, // scale change per copy
    decay: { min: 0.5, max: 0.85 },
    rotateProbability: 0.4,
    zoomProbability: 0.3,
    mirrorProbability: 0.35, // ghosts on both sides of the original
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
    colorShiftPercent: { min: 0.005, max: 0.03 },
    invertProbability: 0.5,
  },
  gridSwap: {
    baseGridSize: { min: 2, max: 20 },
    extraGridCells: { min: 1, max: 3 },
  },
  halftone: {
    numColors: { min: 2, max: 6 },
  },
  lightLeak: {
    numLeaks: { min: 1, max: 4 },
    radiusPercent: { min: 0.4, max: 1.2 },
    falloff: { min: 0.2, max: 0.5 },
  },
  lowPoly: {
    cells: { min: 10, max: 40 },
    jitter: { min: 0.4, max: 0.9 },
  },
  kaleidoscope: {
    squareCount: { min: 2, max: 20 },
    sourceOffsetPercent: { min: 0, max: 1 }, // where to sample from in non-square images
    fillCanvasProbability: 0.5, // chance to stretch to fill vs maintain square
  },
  melt: {
    scalePercent: { min: 0.01, max: 0.08 },
    baseFrequency: { min: 0.003, max: 0.02 },
    numOctaves: { min: 2, max: 4 },
  },
  motionMask: {
    numEchoes: { min: 2, max: 6 },
    stepPercent: { min: 0.002, max: 0.012 }, // shift per echo, % of short side
    threshold: { min: 0.04, max: 0.15 },
    gain: { min: 2.5, max: 6 }, // contrast applied to differences above threshold
    decay: { min: 0.55, max: 0.85 },
    dim: { min: 0, max: 0.35 }, // how much of the original shows through
  },
  neonEdge: {
    threshold: { min: 0.08, max: 0.2 },
    darken: { min: 0.1, max: 0.3 },
    glowRadius: { min: 2, max: 5 },
    numHues: { min: 1, max: 3 },
  },
  oilPaint: {
    radiusPercent: { min: 0.003, max: 0.007 },
    levels: { min: 4, max: 10 },
    saturation: { min: 1.2, max: 1.6 },
  },
  photocopy: {
    threshold: { min: 0.4, max: 0.6 },
    noise: { min: 0.1, max: 0.25 },
    generations: { min: 1, max: 5 },
    smear: { min: 0, max: 3 },
    bandHeight: { min: 4, max: 30 },
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
    blurStrength: { min: 0.1, max: 0.6 },
    centerVariation: { min: 0.2, max: 0.8 },
  },
  risograph: {
    numLayers: { min: 2, max: 4 },
    grain: { min: 0.1, max: 0.3 },
    misregistration: { min: 0.003, max: 0.015 },
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
  smear: {
    numSamples: { min: 12, max: 40 },
    distancePercent: { min: 0.05, max: 0.3 },
    rotation: { min: 5, max: 40 }, // degrees, for rotational smears
    rotateProbability: 0.35,
    curveProbability: 0.5, // curved vs straight trajectory
    sharpness: { min: 0, max: 0.5 }, // share of the sharp original kept in the average
  },
  sketch: {
    lineThickness: { min: 1, max: 5 },
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
  velocityBlur: {
    numSamples: { min: 12, max: 24 },
    speedPercent: { min: 0.02, max: 0.09 },
    numBands: { min: 4, max: 16 },
    numBlobs: { min: 2, max: 6 },
  },
  vhs: {
    trackingNoise: { min: 0.02, max: 0.1 },
    colorBleedPercent: { min: 0.002, max: 0.01 },
    wobblePercent: { min: 0.002, max: 0.006 },
    noiseIntensity: { min: 0.05, max: 0.2 },
  },
  waves: {
    amplitudePercent: { min: 0.01, max: 0.1 },
    frequency: { min: 0.005, max: 0.05 },
  },
};
