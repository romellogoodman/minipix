#!/usr/bin/env node

// Renderer benchmark + determinism check.
//
//   npm run bench -- --split=train --save=bench/baseline-train.json   record hashes + timings
//   npm run bench -- --split=test --check=bench/baseline-test.json    compare against them
//   npm run bench -- --split=test --out=review/before                 also save each render as JPEG
//
// Every case is (renderer, image, seed). The pixel hash must match the golden
// file exactly (same seed => same output); the time is the fastest of --reps runs.
// "train" and "test" use different images and seeds, so a speedup that only
// shows up on the train cases is a sign of overfitting to them.

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';

const { createCanvas, loadImage, ImageData } = await import('canvas');
globalThis.ImageData = ImageData;
const { getRendererNames, renderToCanvas } = await import('./cli-renderers.js');

const SPLITS = {
  // 1333x1333 plus a non-square crop of it.
  train: {
    images: [
      { file: 'public/Earth-Infrared-ESA.jpg' },
      { file: 'public/Earth-Infrared-ESA.jpg', crop: [1333, 750] },
    ],
    seeds: [1, 2, 3],
  },
  // 3569x3569 (12.7 MP, about a phone photo), held-out seeds.
  test: {
    images: [{ file: 'public/Tree-Peony-Kazumasa-Ogawa.jpg' }],
    seeds: [101, 202],
  },
};

function parseArgs() {
  const options = { split: 'train', reps: 3, renderers: null, save: null, check: null, out: null };
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'split') options.split = value;
    else if (key === 'reps') options.reps = parseInt(value, 10);
    else if (key === 'renderer') options.renderers = value.split(',');
    else if (key === 'save') options.save = value;
    else if (key === 'check') options.check = value;
    else if (key === 'out') options.out = value;
  }
  if (!SPLITS[options.split]) throw new Error(`Unknown split: ${options.split}`);
  return options;
}

async function loadSource({ file, crop }) {
  const image = await loadImage(file);
  if (!crop) return { image, label: file.split('/').pop() };
  const [width, height] = crop;
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return { image: canvas, label: `${file.split('/').pop()}@${width}x${height}` };
}

function hashCanvas(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return createHash('md5').update(data).digest('hex');
}

async function run() {
  const options = parseArgs();
  const { images, seeds } = SPLITS[options.split];
  const names = options.renderers ?? getRendererNames();
  const golden = options.check ? JSON.parse(await readFile(options.check, 'utf8')) : null;
  const sources = await Promise.all(images.map(loadSource));
  if (options.out) await mkdir(options.out, { recursive: true });

  const results = {};
  let mismatches = 0;
  let total = 0;
  let goldenTotal = 0;

  for (const name of names) {
    let rendererMs = 0;
    let goldenMs = 0;
    for (const { image, label } of sources) {
      for (const seed of seeds) {
        const key = `${name}|${label}|${seed}`;
        let best = Infinity;
        let hash;
        for (let rep = 0; rep < options.reps; rep++) {
          const canvas = createCanvas(image.width, image.height);
          const start = performance.now();
          await renderToCanvas(name, { canvas, image, seed });
          best = Math.min(best, performance.now() - start);
          if (rep === 0) {
            hash = hashCanvas(canvas);
            if (options.out) {
              await writeFile(`${options.out}/${name}__${label}__${seed}.jpg`, canvas.toBuffer('image/jpeg', { quality: 0.92 }));
            }
          }
        }
        results[key] = { ms: Math.round(best * 10) / 10, hash };
        rendererMs += best;

        const expected = golden?.[key];
        if (expected) {
          goldenMs += expected.ms;
          if (expected.hash !== hash) {
            mismatches++;
            console.log(`MISMATCH ${key}`);
          }
        }
      }
    }
    total += rendererMs;
    goldenTotal += goldenMs;
    const delta = golden ? `  (${goldenMs.toFixed(0)}ms before, ${(goldenMs / rendererMs).toFixed(2)}x)` : '';
    console.log(`${name.padEnd(24)} ${rendererMs.toFixed(0).padStart(7)}ms${delta}`);
  }

  console.log(`\nTOTAL ${total.toFixed(0)}ms${golden ? ` vs ${goldenTotal.toFixed(0)}ms (${(goldenTotal / total).toFixed(3)}x)` : ''}`);
  if (golden) console.log(mismatches ? `${mismatches} HASH MISMATCHES` : 'all hashes match');

  if (options.save) {
    const existing = await readFile(options.save, 'utf8').then(JSON.parse).catch(() => ({}));
    await writeFile(options.save, JSON.stringify({ ...existing, ...results }, null, 2) + '\n');
  }
  if (mismatches) process.exit(1);
}

run();
