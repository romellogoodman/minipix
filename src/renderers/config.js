// Renderer configuration
export const rendererConfig = {
  angularBlur: {
    sweepDegrees: { min: 4, max: 30 },
    center: { min: 0.2, max: 0.8 }, // centre x and y, as fractions of width/height
  },
  arrowField: {
    cols: { min: 24, max: 64 },
    darken: { min: 0.5, max: 0.85 },
    hueProbability: 0.5, // colour arrows by direction vs single accent
    tangentProbability: 0.5, // arrows along edges vs across them
  },
  asciiMosaic: {
    cols: { min: 60, max: 160 },
  },
  barShift: {
    count: { min: 4, max: 36 }, // bars across the longest side
    shiftPercent: { min: 0.03, max: 0.25 },
    activeFraction: { min: 0.5, max: 1 },
    unevenProbability: 0.5,
    tintProbability: 0.4,
    tintFraction: { min: 0.2, max: 0.6 },
    splitPercent: { min: 0.004, max: 0.02 },
  },
  barSwap: {
    numBars: { min: 4, max: 50 },
  },
  bokehBlur: {
    radiusPercent: { min: 0.01, max: 0.035 },
    highlightGain: { min: 6, max: 30 },
    highlightPercentile: { min: 0.85, max: 0.97 }, // pixels above this luminance percentile bloom
    bladeCount: { min: 5, max: 9 }, // 9 = circular iris
    novelShapeProbability: 0.25, // star / heart / ring / cross aperture
    fringeProbability: 0.5,
    fringe: { min: 0.1, max: 0.4 },
  },
  bulge: {
    radiusPercent: { min: 0.35, max: 0.75 },
    strength: { min: 0.6, max: 0.95 },
    falloff: { min: 0.3, max: 1 },
    sphereDepth: { min: 0.8, max: 2.5 },
    rimIntensity: { min: 0.15, max: 0.6 },
    rimSoftness: { min: 0.2, max: 0.8 },
    pinchProbability: 0.35,
    sphereProbability: 0.3,
  },
  chalkboard: {
    strokePercent: { min: 0.0005, max: 0.0015 }, // outline width
    sensitivity: { min: 0.45, max: 0.8 },
    hatchPercent: { min: 0.006, max: 0.014 },
    shading: { min: 0.5, max: 0.9 },
    grain: { min: 0.3, max: 0.7 },
    smudge: { min: 0.1, max: 0.5 },
    hatchLightsProbability: 0.65, // hatch the lights; otherwise the darks
    colorChalkProbability: 0.3,
  },
  channelBlur: {
    radiusPercent: { min: 0.002, max: 0.03 }, // drawn separately for R, G, B
    sharpChannelProbability: 0.5, // one random channel stays sharp
    offsetProbability: 0.5,
    offsetPercent: { min: 0.002, max: 0.012 }, // per-channel nudge at a random angle
  },
  chromaticAberration: {
    strength: { min: 0.05, max: 0.3 }, // 1 = shift of 0.1 * min(w,h)
    radialProbability: 0.5,
    smearProbability: 0.4,
    radialFalloff: { min: 1, max: 2.5 },
    jitter: 0.35, // per-channel jitter on the shuffled -1/0/+1 multipliers
  },
  circlePacking: {
    attempts: { min: 3000, max: 8000 },
    minRadiusPercent: 0.004,
    maxRadiusPercent: 0.06,
    padding: 1,
  },
  compression: {
    cellPercent: { min: 0.0012, max: 0.003 }, // DCT sample cell, fraction of min(w,h); block = 8 cells
    quality: { min: 4, max: 16 }, // IJG JPEG quality
    chromaGain: { min: 1, max: 1.6 }, // "deep-fried" chroma boost before encoding
    regionProbability: 0.4, // quality wanders over noise regions
    regionQuality: { min: 20, max: 60 },
    regionScale: { min: 1.5, max: 4 },
    dcChromaProbability: 0.35, // chroma blocks keep only DC (flat 16-cell colour)
    chromaShift: { min: 0, max: 1 }, // chroma grid offset from luma grid
    recompressProbability: 0.35, // second save on a shifted 8x8 grid
  },
  concentricSpin: {
    rings: { min: 3, max: 18 },
    intensity: { min: 15, max: 90 }, // degrees
    smoothness: { min: 0, max: 0.6 },
    unevenProbability: 0.5,
  },
  contourLines: {
    blurPercent: { min: 0.002, max: 0.008 },
    levels: { min: 8, max: 24 },
    gamma: { min: 0.6, max: 1.5 },
    lineWidthPercent: { min: 0.0003, max: 0.0009 },
    softness: { min: 0, max: 0.5 },
    invertProbability: 0.3,
    indexLineProbability: 0.5, // heavier line every 5th level
    paperProbability: 0.3, // paper / bands / dark share one roll; remainder = flattened image
    bandsProbability: 0.25,
    darkProbability: 0.2,
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
  dataMosh: {
    blockPercent: { min: 0.015, max: 0.05 }, // macroblock size (rounded to 8 px multiples)
    coarseFraction: { min: 0.15, max: 0.5 },
    intensity: { min: 0.6, max: 1 },
    trailBlocks: { min: 2, max: 10 },
    rekey: { min: 0.03, max: 0.25 }, // live image bled back in per block of travel
    quantize: { min: 0.2, max: 0.7 },
    quantLevels: { min: 6, max: 18 },
    episodeScale: { min: 1, max: 3 },
    flowFrequency: { min: 0.5, max: 3 },
  },
  diffuseBlur: {
    amountPercent: { min: 0.003, max: 0.02 }, // max scatter distance
    discProbability: 0.5, // round vs square scatter
    stretchProbability: 0.3, // directional, brushed grain
    squash: { min: 0.05, max: 0.35 }, // cross-axis scale when stretched
    patchyProbability: 0.4, // noise-modulated diffusion
    patchScale: { min: 2, max: 6 },
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
  emboss: {
    blurPercent: { min: 0.0005, max: 0.0025 },
    depth: { min: 0.6, max: 2.0 },
    elevation: { min: 25, max: 55 }, // light elevation, degrees
    lightIntensity: { min: 0.6, max: 1.2 },
    shadowIntensity: { min: 0.3, max: 0.7 },
    stoneScale: { min: 0.6, max: 2 }, // stone mode only
    distortion: { min: 0.1, max: 0.5 }, // stone mode only
    debossProbability: 0.3,
    stoneProbability: 0.3, // stone / plate share one roll; remainder = relief over colour
    plateProbability: 0.3,
  },
  engraving: {
    lines: { min: 70, max: 160 }, // lines across the short side
    relief: { min: 0.2, max: 1.0 },
    waviness: { min: 0.1, max: 0.6 },
    contrast: { min: 1.0, max: 1.6 },
    spiralProbability: 0.2, // spiral / crosshatch share one roll; remainder = single line plate
    crosshatchProbability: 0.45,
    flowProbability: 0.5, // lines bend along the orientation field (non-spiral)
    colorInkProbability: 0.2, // ink takes the darkened source colour
  },
  filmGrain: {
    grainIntensity: { min: 0.1, max: 0.5 },
    tintStrength: { min: 0.1, max: 0.6 },
    contrast: { min: 0.9, max: 1.3 },
    vignette: { min: 0.2, max: 0.6 },
    scratchCount: { min: 0, max: 20 },
  },
  flutedGlass: {
    flutes: { min: 6, max: 36 }, // across the short side
    softness: { min: 0, max: 1 },
    refraction: { min: 0.8, max: 2.5 },
    aberration: { min: 0, max: 0.6 },
    highlight: { min: 0.1, max: 0.6 },
    highlightSoftness: { min: 0.1, max: 0.6 },
    lightAngle: { min: -60, max: 60 },
    waveAmplitude: { min: 0.015, max: 0.06 },
    waveFrequency: { min: 0.5, max: 3 },
    angledProbability: 0.3,
  },
  glassTiles: {
    tileCount: { min: 4, max: 16 }, // tiles across the longest side
    refraction: { min: 0.8, max: 3 }, // in-tile sampling slope
    magnifyProbability: 0.35,
    rotateProbability: 0.35,
    roundness: { min: 0, max: 1 },
    bevelProbability: 0.5,
    bevelStrength: { min: 0.08, max: 0.22 },
  },
  glitch: {
    numSlices: { min: 5, max: 30 },
    maxOffset: { min: 0.02, max: 0.15 },
    colorShiftProbability: 0.3,
    colorShiftPercent: { min: 0.005, max: 0.03 },
    invertProbability: 0.5,
  },
  glow: {
    threshold: { min: 0.4, max: 0.75 },
    radiusPercent: { min: 0.04, max: 0.14 },
    intensity: { min: 0.9, max: 2.2 },
    tintProbability: 0.35,
    tintAmount: { min: 0.3, max: 0.8 },
    sparkleProbability: 0.5,
    sparkleSpacingPercent: { min: 0.06, max: 0.16 },
    sparkleThreshold: { min: 0.8, max: 0.92 },
    sparkleDensity: { min: 0.25, max: 0.8 },
    sparkleIntensity: { min: 1, max: 2 },
    rayLength: { min: 0.4, max: 1 },
    sixPointProbability: 0.35,
    colorize: { min: 0, max: 0.6 },
  },
  gradientMap: {
    stops: { min: 3, max: 5 },
    contrast: { min: 1, max: 1.5 },
    midpoint: { min: 0.4, max: 0.6 },
    strength: { min: 0.9, max: 1 },
    reverseProbability: 0.12,
    cosineProbability: 0.35, // cosine palette
    harmonyProbability: 0.45, // seeded hue harmony, else a COLOR_RAMPS preset
    chroma: { min: 0.12, max: 0.24 }, // OKLCH chroma for harmony palettes
  },
  gridSwap: {
    baseGridSize: { min: 2, max: 20 },
    extraGridCells: { min: 1, max: 3 },
  },
  halftone: {
    numColors: { min: 2, max: 6 },
  },
  lensDistortion: {
    spread: { min: 0.15, max: 0.5 },
    bulge: { min: 0.15, max: 0.9 },
    pincushionProbability: 0.4,
    perspective: { min: 0, max: 1 },
    bias: { min: -1, max: 1 },
    count: { min: 6, max: 14 }, // spectral taps; higher counts approach the worker timeout
    dispersion: { min: 0.6, max: 1 },
    dispersionShift: { min: -1, max: 1 },
    focusCenter: { min: 0.3, max: 0.9 },
    focusEdges: { min: 0.4, max: 1 },
    swirl: { min: -0.6, max: 0.6 },
    noiseProbability: 0.3,
    noise: { min: 0.3, max: 1 },
    noiseFrequency: { min: 0.1, max: 0.5 },
    circleProbability: 0.2,
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
  mirror: {
    secondAngle: { min: 30, max: 150 },
    snapProbability: 0.4,
    twoLinesProbability: 0.4,
    flipProbability: 0.25,
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
  paperPrint: {
    contrast: { min: 0.9, max: 1.3 },
    fade: { min: 0.03, max: 0.14 }, // lifted blacks
    saturation: { min: 0.55, max: 0.95 },
    warmth: { min: -0.6, max: 1 },
    splitTone: { min: 0.04, max: 0.16 },
    vignette: { min: 0.35, max: 0.85 },
    vignetteRadius: { min: 0.3, max: 0.6 },
    vignetteFalloff: { min: 0.3, max: 0.7 },
    roughness: { min: 0.15, max: 0.4 },
    fibreDensity: { min: 0.3, max: 1.5 },
    displacement: { min: 0, max: 2 }, // px per 1000 px of min dim, along fibre relief
    tooth: { min: 0.3, max: 1 },
    foxingProbability: 0.35,
    foxing: { min: 0.3, max: 1 },
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
  polar: {
    petals: { min: 1, max: 3 },
    radiusScale: { min: 0.5, max: 1.1 },
    intensity: { min: 0.35, max: 0.75 }, // partial-blend swirl only
    toPolarProbability: 0.55,
    blendProbability: 0.25,
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
  solarize: {
    threshold: { min: 0.25, max: 0.65 },
    strength: { min: 0.92, max: 1 },
    channelProbability: 0.55, // per-channel Sabattier curve vs whole-pixel luma flip
    stretch: { min: 0.5, max: 1 },
    folds: { min: 1, max: 3 }, // channel mode: re-solarize the curve n times
    hueProbability: 0.45,
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
  tiltShift: {
    verticalProbability: 0.2,
    angleDegrees: { min: -30, max: 30 },
    center: { min: 0.35, max: 0.65 }, // band position across the image
    focusWidthPercent: { min: 0.04, max: 0.2 },
    falloffPercent: { min: 0.15, max: 0.45 },
    blurPercent: { min: 0.008, max: 0.025 }, // max blur sigma
    saturation: { min: 1.1, max: 1.4 },
    progressiveProbability: 0.25, // blur on one side only
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
  watercolor: {
    radiusPercent: { min: 0.004, max: 0.01 },
    bleed: { min: 0.3, max: 1.5 },
    density: { min: 0.6, max: 0.9 },
    edgeDarken: { min: 0.4, max: 1.2 },
    granulation: { min: 0.15, max: 0.5 },
    penProbability: 0.3,
    vignetteProbability: 0.4,
  },
  waves: {
    amplitudePercent: { min: 0.01, max: 0.1 },
    frequency: { min: 0.005, max: 0.05 },
  },
};
