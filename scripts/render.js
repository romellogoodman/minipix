#!/usr/bin/env node

import { createCanvas, loadImage, ImageData } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Import renderers and config
import * as renderers from '../src/renderers.js';

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
    parallel: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--file=')) {
      options.file = arg.split('=')[1];
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--renderer=')) {
      options.renderer = arg.split('=')[1];
    } else if (arg.startsWith('--seed=')) {
      options.seed = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--quality=')) {
      options.quality = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--compression=')) {
      options.compression = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--no-parallel') {
      options.parallel = false;
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
  --renderer=<name>      Specific renderer to use (default: random enabled renderers)
  --seed=<number>        Seed value for reproducible output (default: random)
  --output=<path>        Output directory (default: ./output)
  --format=<png|jpeg>    Output format (default: png)
  --quality=<0-1>        JPEG quality 0-1 (default: 0.92, only for JPEG)
  --compression=<0-9>    PNG compression 0-9 (default: 6, only for PNG)
  --no-parallel          Disable parallel rendering (default: parallel enabled)
  -h, --help             Show this help message

Performance Tips:
  - Use --format=jpeg for ~5-10x faster file writing
  - Parallel rendering is enabled by default for multiple images
  - Lower --compression (e.g., 3) for faster PNG writes
  - JPEG quality 0.85-0.95 provides good balance of speed/quality

Available Renderers:
${getEnabledRenderers().map(name => `  ${name}`).join('\n')}

Examples:
  npm run render -- --file=image.jpg --count=10 --format=jpeg
  npm run render -- --file=image.jpg --renderer=barSwap --count=3
  npm run render -- --file=image.jpg --seed=12345 --format=png --compression=3
  npm run render -- --file=image.jpg --output=./my-renders --no-parallel
  `);
}

// Get list of available renderers
function getEnabledRenderers() {
  // Get all renderer functions (exclude rendererConfig itself)
  return Object.keys(renderers)
    .filter(name => name !== 'rendererConfig' && typeof renderers[name] === 'function');
}

// Get renderer function by name
function getRenderer(name) {
  return renderers[name];
}

// Render a single image
async function renderSingle(image, basename, rendererName, seed, options, index) {
  const rendererFn = getRenderer(rendererName);
  const seedHash = seed.toString(36).padStart(6, '0');

  // Create canvas
  const canvas = createCanvas(image.width, image.height);

  // Run renderer
  const startTime = Date.now();
  rendererFn({ canvas, image, seed });
  const renderTime = Date.now() - startTime;

  // Generate output filename
  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const outputFilename = `${basename}-minipix-${rendererName}-${seedHash}.${ext}`;
  const outputPath = path.join(options.output, outputFilename);

  // Save to file with appropriate format
  let buffer;
  const writeStartTime = Date.now();

  if (options.format === 'jpeg') {
    buffer = canvas.toBuffer('image/jpeg', { quality: options.quality });
  } else {
    buffer = canvas.toBuffer('image/png', { compressionLevel: options.compression });
  }

  fs.writeFileSync(outputPath, buffer);
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

  // Validate required options
  if (!options.file) {
    console.error('Error: --file parameter is required');
    printHelp();
    process.exit(1);
  }

  // Validate format
  if (!['png', 'jpeg'].includes(options.format)) {
    console.error('Error: --format must be either "png" or "jpeg"');
    process.exit(1);
  }

  // Check if file exists
  if (!fs.existsSync(options.file)) {
    console.error(`Error: File not found: ${options.file}`);
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  // Load image
  console.log(`Loading image: ${options.file}`);
  const image = await loadImage(options.file);
  console.log(`Image loaded: ${image.width}x${image.height}`);

  // Get base filename without extension
  const basename = path.basename(options.file, path.extname(options.file));

  // Get enabled renderers
  const enabledRenderers = getEnabledRenderers();
  if (enabledRenderers.length === 0) {
    console.error('Error: No renderers are enabled');
    process.exit(1);
  }

  // Validate renderer if specified
  if (options.renderer) {
    if (!enabledRenderers.includes(options.renderer)) {
      console.error(`Error: Renderer '${options.renderer}' is not available or not enabled`);
      console.log(`Available renderers: ${enabledRenderers.join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`\nGenerating ${options.count} render(s) ${options.parallel ? 'in parallel' : 'sequentially'}...`);
  const overallStartTime = Date.now();

  // Prepare render jobs
  const jobs = [];
  for (let i = 0; i < options.count; i++) {
    const rendererName = options.renderer ||
      enabledRenderers[Math.floor(Math.random() * enabledRenderers.length)];
    const seed = options.seed !== null ? options.seed : Math.floor(Math.random() * 0xFFFFFFFF);

    jobs.push({ rendererName, seed, index: i });
  }

  // Execute renders
  let results;
  if (options.parallel) {
    // Parallel execution
    const promises = jobs.map(job =>
      renderSingle(image, basename, job.rendererName, job.seed, options, job.index)
    );
    results = await Promise.all(promises);
  } else {
    // Sequential execution
    results = [];
    for (const job of jobs) {
      const result = await renderSingle(image, basename, job.rendererName, job.seed, options, job.index);
      results.push(result);
      console.log(`[${result.index}/${options.count}] ${result.rendererName} - ${result.totalTime}ms (render: ${result.renderTime}ms, write: ${result.writeTime}ms)`);
    }
  }

  const overallTime = Date.now() - overallStartTime;

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('RENDER SUMMARY');
  console.log('='.repeat(60));

  if (options.parallel) {
    // Show all results sorted by index
    results.sort((a, b) => a.index - b.index);
    results.forEach(result => {
      const sizeMB = (result.fileSize / 1024 / 1024).toFixed(2);
      console.log(`[${result.index}/${options.count}] ${result.rendererName} - ${result.totalTime}ms (${sizeMB}MB)`);
    });
  }

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
