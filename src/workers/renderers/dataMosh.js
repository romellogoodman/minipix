import { randFloat } from "../utils.js";

const MAX_SEGMENTS = 48;

/**
 * Corrupted-codec smearing. The shader runs a feedback loop where "held"
 * macroblocks keep re-sampling their previous contents displaced by a
 * per-block motion vector; for a still image that loop's steady state can be
 * traced directly. Each held pixel walks backwards along the motion vectors
 * of the blocks it passes through, stopping exactly where it enters an
 * intact block — so the pixels on that border get dragged into continuous
 * streaks — or where its trail budget runs out. A little live image is
 * re-keyed in along the way, and codec-style quantization goes on top.
 * Blocks are 8 px multiples mixed with coarser partitions, and corruption
 * comes in smooth regional "episodes" with ragged block-shaped borders.
 */
export default function dataMosh({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  const blockPct = randFloat(config.blockPercent, random);
  const coarseMul = random() < 0.5 ? 2 : 4;
  const coarsePick = randFloat(config.coarseFraction, random);
  const intensity = randFloat(config.intensity, random);
  const trail = randFloat(config.trailBlocks, random);
  const rekey = randFloat(config.rekey, random);
  const quantAmount = randFloat(config.quantize, random);
  const quantLevels = Math.round(randFloat(config.quantLevels, random));
  const episodeScale = randFloat(config.episodeScale, random);
  const flowFreq = randFloat(config.flowFrequency, random);
  const phases = new Float32Array(6);
  for (let i = 0; i < phases.length; i++) phases[i] = random() * Math.PI * 2;
  const hashSeed = (random() * 0xffffffff) >>> 0;

  const bs = Math.max(8, Math.round((minDim * blockPct) / 8) * 8);
  const cbs = bs * coarseMul;
  const fw = Math.ceil(width / bs);
  const fh = Math.ceil(height / bs);
  const cw = Math.ceil(width / cbs);
  const ch = Math.ceil(height / cbs);
  const nf = fw * fh;
  const total = nf + cw * ch;

  // Block tables (fine blocks first, then coarse): hold strength, unit
  // backward direction, trail budget in px, and the block's bounds.
  const hold = new Float32Array(total);
  const dirX = new Float32Array(total);
  const dirY = new Float32Array(total);
  const budget = new Float32Array(total);
  const x0s = new Int32Array(total);
  const y0s = new Int32Array(total);
  const sizes = new Int32Array(total);
  const coarse = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) coarse[i] = hash(i, hashSeed, 9) < coarsePick ? 1 : 0;

  const thresh = 1 - intensity * 0.55;
  const fillBlock = (idx, bx, by, size, salt) => {
    const bcx = (((bx + 0.5) * size) / width) * episodeScale;
    const bcy = (((by + 0.5) * size) / height) * episodeScale;
    const h1 = hash(idx, hashSeed, salt);
    const h2 = hash(idx, hashSeed, salt + 1);
    const h3 = hash(idx, hashSeed, salt + 2);
    // Product-wave "episode" field; the block hash only roughens its borders.
    const field = 0.5 +
      0.25 * Math.sin(bcx * 2.7 + phases[0]) * Math.sin(bcy * 2.1 + phases[1]) +
      0.25 * Math.sin((bcx + bcy) * 1.6 + phases[2]);
    hold[idx] = smoothstep(thresh - 0.09, thresh + 0.09, field + (h1 - 0.5) * 0.3);
    // Smooth flow field + per-block jitter so neighbours smear coherently.
    const ang = Math.sin(bcx * 1.9 * flowFreq + phases[3]) * 1.7 +
      Math.cos(bcy * 2.3 * flowFreq + phases[4]) * 1.3 + phases[5] +
      (h2 - 0.5) * 1.1;
    dirX[idx] = -Math.cos(ang);
    dirY[idx] = -Math.sin(ang);
    budget[idx] = (0.4 + 0.6 * h3) * trail * size;
    x0s[idx] = bx * size;
    y0s[idx] = by * size;
    sizes[idx] = size;
  };
  for (let by = 0; by < fh; by++) {
    for (let bx = 0; bx < fw; bx++) fillBlock(by * fw + bx, bx, by, bs, 1);
  }
  for (let by = 0; by < ch; by++) {
    for (let bx = 0; bx < cw; bx++) fillBlock(nf + by * cw + bx, bx, by, cbs, 5);
  }

  const blockAt = (x, y) => {
    const ci = ((y / cbs) | 0) * cw + ((x / cbs) | 0);
    return coarse[ci] ? nf + ci : ((y / bs) | 0) * fw + ((x / bs) | 0);
  };

  const tap = new Float32Array(3);
  const maxX = width - 1;
  const maxY = height - 1;
  // Re-key per pixel of travel, so the live image fades back in along long trails.
  const keepPerBlock = 1 - rekey;
  const logKeep = Math.log(keepPerBlock) / bs;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const start = blockAt(x, y);
      const h = hold[start];
      const lr = imageData[o];
      const lg = imageData[o + 1];
      const lb = imageData[o + 2];
      outputData[o + 3] = 255;
      if (h < 0.01) {
        outputData[o] = lr;
        outputData[o + 1] = lg;
        outputData[o + 2] = lb;
        continue;
      }

      // Walk backwards block by block, stepping exactly to each block exit.
      let px = x + 0.5;
      let py = y + 0.5;
      let left = budget[start];
      let sr = 0, sg = 0, sb = 0;
      let remain = 1;
      let bi = start;
      for (let k = 0; k < MAX_SEGMENTS && left > 0; k++) {
        const ux = dirX[bi];
        const uy = dirY[bi];
        const bx0 = x0s[bi];
        const by0 = y0s[bi];
        const size = sizes[bi];
        const tx = ux > 0 ? (bx0 + size - px) / ux : ux < 0 ? (bx0 - px) / ux : Infinity;
        const ty = uy > 0 ? (by0 + size - py) / uy : uy < 0 ? (by0 - py) / uy : Infinity;
        const step = Math.min(left, Math.min(tx, ty) + 0.01);
        const nx = px + ux * step;
        const ny = py + uy * step;
        if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) break;
        px = nx;
        py = ny;
        left -= step;
        const kept = Math.exp(logKeep * step);
        const w = remain * (1 - kept);
        sampleBilinear(imageData, width, height, px, py, tap);
        sr += tap[0] * w;
        sg += tap[1] * w;
        sb += tap[2] * w;
        remain *= kept;
        bi = blockAt(px, py);
        if (hold[bi] < 0.5) break;
      }
      // The remaining weight sits on wherever the trail ended.
      sampleBilinear(imageData, width, height, Math.min(px, maxX), Math.min(py, maxY), tap);
      sr += tap[0] * remain;
      sg += tap[1] * remain;
      sb += tap[2] * remain;

      // Generation loss: pull toward a coarse palette.
      sr += (quant(sr, quantLevels) - sr) * quantAmount;
      sg += (quant(sg, quantLevels) - sg) * quantAmount;
      sb += (quant(sb, quantLevels) - sb) * quantAmount;

      outputData[o] = lr + (sr - lr) * h;
      outputData[o + 1] = lg + (sg - lg) * h;
      outputData[o + 2] = lb + (sb - lb) * h;
    }
  }
}

function quant(v, levels) {
  return ((Math.floor((v / 256) * levels) + 0.5) / levels) * 255;
}

function smoothstep(e0, e1, v) {
  let t = (v - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

// Deterministic [0, 1) hash of (index, seed, salt).
function hash(i, seed, salt) {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bilinear RGB sample (in-bounds coordinates), written to dst.
function sampleBilinear(src, width, height, x, y, dst) {
  const maxX = width - 1;
  const maxY = height - 1;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = x0 < maxX ? i00 + 4 : i00;
  const i01 = y0 < maxY ? i00 + width * 4 : i00;
  const i11 = x0 < maxX ? i01 + 4 : i01;
  for (let c = 0; c < 3; c++) {
    const a = src[i00 + c];
    const b = src[i01 + c];
    const top = a + (src[i10 + c] - a) * fx;
    const bot = b + (src[i11 + c] - b) * fx;
    dst[c] = top + (bot - top) * fy;
  }
}
