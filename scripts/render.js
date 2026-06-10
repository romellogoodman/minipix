#!/usr/bin/env node

import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

// `canvas` is an optional dependency: it is only needed by this CLI, not by the
// web app. Load it lazily so a missing install produces a helpful message
// instead of a raw module-resolution stack trace.
let createCanvas, loadImage, ImageData;
try {
  ({ createCanvas, loadImage, ImageData } = await import('canvas'));
} catch {
  console.error(
    'Error: the "canvas" package is required to run the CLI but is not installed.\n' +
    'Install it with:  npm install canvas'
  );
  process.exit(1);
}

// Polyfill document.createElement for renderers that use temporary canvases
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      return createCanvas(0, 0);
    }
    throw new Error(`createElement('${tag}') is not supported in Node.js context`);
  }
};

// Polyfill ImageData for renderers that use it
globalThis.ImageData = ImageData;

// Import the CLI renderer registry after the polyfills are in place.
const { getRendererNames, hasRenderer, renderToCanvas } = await import('./cli-renderers.js');

// Match the web app's filename hash (src/App.jsx).
function generateSeedHash(seed) {
  return (seed >>> 0).toString(36).padStart(7, '0');
}

// Parse a numeric CLI argument, validating it is finite and within range.
function parseNumber(raw, { name, integer, min, max }) {
  const value = integer ? parseInt(raw, 10) : parseFloat(raw);
  if (!Number.isFinite(value)) {
    console.error(`Error: --${name} must be a number (got "${raw}")`);
    process.exit(1);
  }
  if (integer && !Number.isInteger(value)) {
    console.error(`Error: --${name} must be an integer (got "${raw}")`);
    process.exit(1);
  }
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    console.error(`Error: --${name} must be between ${min} and ${max} (got ${value})`);
    process.exit(1);
  }
  return value;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    count: 1,
    renderer: null,
    seed: null,
    output: './output',
    format: 'png',
    quality: 0.92,
    compression: 6,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--file=')) {
      options.file = arg.split('=')[1];
    } else if (arg.startsWith('--count=')) {
      options.count = parseNumber(arg.split('=')[1], { name: 'count', integer: true, min: 1, max: 10000 });
    } else if (arg.startsWith('--renderer=')) {
      options.renderer = arg.split('=')[1];
    } else if (arg.startsWith('--seed=')) {
      options.seed = parseNumber(arg.split('=')[1], { name: 'seed', integer: true, min: 0, max: 0xffffffff });
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--quality=')) {
      options.quality = parseNumber(arg.split('=')[1], { name: 'quality', integer: false, min: 0, max: 1 });
    } else if (arg.startsWith('--compression=')) {
      options.compression = parseNumber(arg.split('=')[1], { name: 'compression', integer: true, min: 0, max: 9 });
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Minipix CLI Renderer

Usage: npm run render -- --file=<path> [options]

Options:
  --file=<path>          Path to the image file (required)
  --count=<number>       Number of variations to generate (default: 1)
  --renderer=<name>      Specific renderer to use (default: random renderer per image)
  --seed=<number>        Base seed for reproducible output (default: random)
  --output=<path>        Output directory (default: ./output)
  --format=<png|jpeg>    Output format (default: png)
  --quality=<0-1>        JPEG quality 0-1 (default: 0.92, only for JPEG)
  --compression=<0-9>    PNG compression 0-9 (default: 6, only for PNG)
  -h, --help             Show this help message

Notes:
  - Rendering is CPU-bound and runs on a single thread; images are produced
    sequentially. File writes are async.
  - With --count > 1 and a fixed --seed, each image uses seed + index so the
    outputs are distinct and reproducible.

Available Renderers:
${getRendererNames().map(name => `  ${name}`).join('\n')}

Examples:
  npm run render -- --file=image.jpg --count=10 --format=jpeg
  npm run render -- --file=image.jpg --renderer=barSwap --count=3
  npm run render -- --file=image.jpg --seed=12345 --format=png --compression=3
  `);
}

// Render a single image and write it to disk.
async function renderSingle(image, basename, rendererName, seed, options, index) {
  const seedHash = generateSeedHash(seed);

  const canvas = createCanvas(image.width, image.height);

  const startTime = Date.now();
  await renderToCanvas(rendererName, { canvas, image, seed, ImageData });
  const renderTime = Date.now() - startTime;

  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const outputFilename = `${basename}-minipix-${rendererName}-${seedHash}.${ext}`;
  const outputPath = path.join(options.output, outputFilename);

  let buffer;
  const writeStartTime = Date.now();

  if (options.format === 'jpeg') {
    buffer = canvas.toBuffer('image/jpeg', { quality: options.quality });
  } else {
    buffer = canvas.toBuffer('image/png', { compressionLevel: options.compression });
  }

  await writeFile(outputPath, buffer);
  const writeTime = Date.now() - writeStartTime;
  const totalTime = Date.now() - startTime;

  return {
    index: index + 1,
    rendererName,
    seed,
    outputPath,
    renderTime,
    writeTime,
    totalTime,
    fileSize: buffer.length
  };
}

// Main render function
async function render() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Error: --file parameter is required');
    printHelp();
    process.exit(1);
  }

  if (!['png', 'jpeg'].includes(options.format)) {
    console.error('Error: --format must be either "png" or "jpeg"');
    process.exit(1);
  }

  if (!fs.existsSync(options.file)) {
    console.error(`Error: File not found: ${options.file}`);
    process.exit(1);
  }

  await mkdir(options.output, { recursive: true });

  console.log(`Loading image: ${options.file}`);
  const image = await loadImage(options.file);
  console.log(`Image loaded: ${image.width}x${image.height}`);

  const basename = path.basename(options.file, path.extname(options.file));

  const rendererNames = getRendererNames();

  if (options.renderer && !hasRenderer(options.renderer)) {
    console.error(`Error: Renderer '${options.renderer}' is not available`);
    console.log(`Available renderers: ${rendererNames.join(', ')}`);
    process.exit(1);
  }

  // Prepare render jobs. When a base seed is given, derive per-job seeds
  // (seed + index) so multiple counts produce distinct, reproducible output
  // instead of all overwriting one file.
  const jobs = [];
  for (let i = 0; i < options.count; i++) {
    const rendererName = options.renderer ||
      rendererNames[Math.floor(Math.random() * rendererNames.length)];
    const seed = options.seed !== null
      ? (options.seed + i) >>> 0
      : Math.floor(Math.random() * 0xffffffff);

    jobs.push({ rendererName, seed, index: i });
  }

  console.log(`\nGenerating ${options.count} render(s)...`);
  const overallStartTime = Date.now();

  const results = [];
  for (const job of jobs) {
    const result = await renderSingle(image, basename, job.rendererName, job.seed, options, job.index);
    results.push(result);
    console.log(`[${result.index}/${options.count}] ${result.rendererName} - ${result.totalTime}ms (render: ${result.renderTime}ms, write: ${result.writeTime}ms)`);
  }

  const overallTime = Date.now() - overallStartTime;

  console.log(`\n${'='.repeat(60)}`);
  console.log('RENDER SUMMARY');
  console.log('='.repeat(60));

  const totalRenderTime = results.reduce((sum, r) => sum + r.renderTime, 0);
  const totalWriteTime = results.reduce((sum, r) => sum + r.writeTime, 0);
  const avgRenderTime = Math.round(totalRenderTime / results.length);
  const avgWriteTime = Math.round(totalWriteTime / results.length);
  const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);

  console.log('='.repeat(60));
  console.log(`Total time:        ${overallTime}ms`);
  console.log(`Avg render time:   ${avgRenderTime}ms`);
  console.log(`Avg write time:    ${avgWriteTime}ms`);
  console.log(`Total output size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Output directory:  ${options.output}`);
  console.log('='.repeat(60));
}

// Run the CLI
render().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
