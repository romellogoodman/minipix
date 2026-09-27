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

// The dithering helpers construct ImageData, which Node lacks.
globalThis.ImageData = ImageData;

// Import the renderer registry after the polyfill is in place.
const { getRendererNames, hasRenderer, renderToCanvas } = await import('./cli-renderers.js');

// Same hash as the web app's filenames (src/utils/download.js, which is
// browser-only).
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

  for (const arg of args) {
    // Everything after the first "=", so paths may contain "=".
    const value = arg.slice(arg.indexOf('=') + 1);

    if (arg.startsWith('--file=')) {
      options.file = value;
    } else if (arg.startsWith('--count=')) {
      options.count = parseNumber(value, { name: 'count', integer: true, min: 1, max: 10000 });
    } else if (arg.startsWith('--renderer=')) {
      options.renderer = value;
    } else if (arg.startsWith('--seed=')) {
      options.seed = parseNumber(value, { name: 'seed', integer: true, min: 0, max: 0xffffffff });
    } else if (arg.startsWith('--output=')) {
      options.output = value;
    } else if (arg.startsWith('--format=')) {
      options.format = value.toLowerCase();
    } else if (arg.startsWith('--quality=')) {
      options.quality = parseNumber(value, { name: 'quality', integer: false, min: 0, max: 1 });
    } else if (arg.startsWith('--compression=')) {
      options.compression = parseNumber(value, { name: 'compression', integer: true, min: 0, max: 9 });
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

// Renders one image, writes it to disk, and returns its timings.
async function renderSingle(image, basename, rendererName, seed, options) {
  const canvas = createCanvas(image.width, image.height);

  const startTime = Date.now();
  await renderToCanvas(rendererName, { canvas, image, seed });
  const renderTime = Date.now() - startTime;

  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const outputPath = path.join(
    options.output,
    `${basename}-minipix-${rendererName}-${generateSeedHash(seed)}.${ext}`
  );

  const writeStartTime = Date.now();
  const buffer = options.format === 'jpeg'
    ? canvas.toBuffer('image/jpeg', { quality: options.quality })
    : canvas.toBuffer('image/png', { compressionLevel: options.compression });
  await writeFile(outputPath, buffer);
  const writeTime = Date.now() - writeStartTime;

  return { renderTime, writeTime, totalTime: Date.now() - startTime, fileSize: buffer.length };
}

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

  console.log(`\nGenerating ${options.count} render(s)...`);
  const overallStartTime = Date.now();

  // With a base seed, each render uses seed + index so a count > 1 gives
  // distinct, reproducible outputs instead of overwriting one file.
  const results = [];
  for (let i = 0; i < options.count; i++) {
    const rendererName = options.renderer ||
      rendererNames[Math.floor(Math.random() * rendererNames.length)];
    const seed = options.seed !== null
      ? (options.seed + i) >>> 0
      : Math.floor(Math.random() * 0xffffffff);

    const result = await renderSingle(image, basename, rendererName, seed, options);
    results.push(result);
    console.log(`[${i + 1}/${options.count}] ${rendererName} - ${result.totalTime}ms (render: ${result.renderTime}ms, write: ${result.writeTime}ms)`);
  }

  const overallTime = Date.now() - overallStartTime;

  console.log(`\n${'='.repeat(60)}`);
  console.log('RENDER SUMMARY');

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

render().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
