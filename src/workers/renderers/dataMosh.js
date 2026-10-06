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

  // Per-block walk record: exit edge (x, y), reciprocal direction (x, y),
  // direction (x, y) and hold. Exits are picked by direction sign up front.
  const REC = 8;
  const rec = new Float64Array(total * REC);
  for (let i = 0; i < total; i++) {
    const ux = dirX[i];
    const uy = dirY[i];
    const r = i * REC;
    rec[r] = ux > 0 ? x0s[i] + sizes[i] : ux < 0 ? x0s[i] : Infinity;
    rec[r + 1] = uy > 0 ? y0s[i] + sizes[i] : uy < 0 ? y0s[i] : Infinity;
    rec[r + 2] = ux !== 0 ? 1 / ux : 1;
    rec[r + 3] = uy !== 0 ? 1 / uy : 1;
    rec[r + 4] = ux;
    rec[r + 5] = uy;
    rec[r + 6] = hold[i];
  }
  // Fine-grid lookup that already resolves coarse partitions.
  const blockMap = new Int32Array(nf);
  for (let fy = 0; fy < fh; fy++) {
    for (let fx = 0; fx < fw; fx++) {
      const ci = ((fy / coarseMul) | 0) * cw + ((fx / coarseMul) | 0);
      blockMap[fy * fw + fx] = coarse[ci] ? nf + ci : fy * fw + fx;
    }
  }
  const invBs = 1 / bs;
  const blockAt = (x, y) => blockMap[((y * invBs) | 0) * fw + ((x * invBs) | 0)];

  const maxX = width - 1;
  const maxY = height - 1;
  const W4 = width * 4;
  // Re-key per pixel of travel, so the live image fades back in along long trails.
  const keepPerBlock = 1 - rekey;
  const logKeep = Math.log(keepPerBlock) / bs;
  const qScale = quantLevels / 256;
  const qInv = 255 / quantLevels;

  // Every pixel of a block walks the same direction to the block's exit, and
  // from there on its walk only depends on where it crossed the exit edge and
  // how much budget is left. So each block traces "tails" once per exit-edge
  // position (every 1/Q px, built on demand) and stores them as prefix sums;
  // a pixel then needs one step, a short scan over cumulative lengths and two
  // samples. Samples are nearest-pixel.
  const Q = 2;
  const MAXT = MAX_SEGMENTS - 1;
  // Per tail segment: cumulative length through it, colour prefix (r, g, b)
  // and remaining weight before it, start (x, y), direction (x, y).
  const SEG = 9;
  const maxSamples = 2 * (cbs * Q + 1);
  const segs = new Float64Array(maxSamples * MAXT * SEG);
  const tailN = new Int32Array(maxSamples);
  const tailEnd = new Float64Array(maxSamples * 3);
  const built = new Uint8Array(maxSamples);

  // Trace a tail from (px, py) without a budget cap into slot j.
  const buildTail = (j, px, py) => {
    let pr = 0, pg = 0, pb = 0, R = 1, L = 0, n = 0;
    let bi = blockAt(px, py);
    const base = j * MAXT * SEG;
    let ended = false;
    while (n < MAXT) {
      const r = bi * REC;
      const ux = rec[r + 4];
      const uy = rec[r + 5];
      const len = Math.min((rec[r] - px) * rec[r + 2], (rec[r + 1] - py) * rec[r + 3]) + 0.01;
      const q = base + n * SEG;
      segs[q] = L + len;
      segs[q + 1] = pr;
      segs[q + 2] = pg;
      segs[q + 3] = pb;
      segs[q + 4] = R;
      segs[q + 5] = px;
      segs[q + 6] = py;
      segs[q + 7] = ux;
      segs[q + 8] = uy;
      n++;
      const nx = px + ux * len;
      const ny = py + uy * len;
      if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) {
        // Out of bounds: the walk stops where this segment starts.
        const i = (py | 0) * W4 + (px | 0) * 4;
        tailEnd[j * 3] = pr + R * imageData[i];
        tailEnd[j * 3 + 1] = pg + R * imageData[i + 1];
        tailEnd[j * 3 + 2] = pb + R * imageData[i + 2];
        ended = true;
        break;
      }
      px = nx;
      py = ny;
      L += len;
      const kept = fastExp(logKeep * len);
      const w = R * (1 - kept);
      const i = (py | 0) * W4 + (px | 0) * 4;
      pr += imageData[i] * w;
      pg += imageData[i + 1] * w;
      pb += imageData[i + 2] * w;
      R *= kept;
      bi = blockAt(px, py);
      if (rec[bi * REC + 6] < 0.5) break;
    }
    if (!ended) {
      const i = (py | 0) * W4 + (px | 0) * 4;
      tailEnd[j * 3] = pr + R * imageData[i];
      tailEnd[j * 3 + 1] = pg + R * imageData[i + 1];
      tailEnd[j * 3 + 2] = pb + R * imageData[i + 2];
    }
    tailN[j] = n;
    built[j] = 1;
  };

  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const live = (idx) => (idx < nf ? blockMap[idx] === idx : coarse[idx - nf] === 1);

  for (let idx = 0; idx < total; idx++) {
    if (!live(idx)) continue;
    const size = sizes[idx];
    const bx0 = x0s[idx];
    const by0 = y0s[idx];
    const xEnd = Math.min(bx0 + size, width);
    const yEnd = Math.min(by0 + size, height);
    const h = hold[idx];
    if (h < 0.01) {
      for (let y = by0; y < yEnd; y++) {
        const p0 = y * width;
        for (let x = bx0; x < xEnd; x++) out32[p0 + x] = 0xff000000 | (imageData[(p0 + x) * 4 + 2] << 16) |
          (imageData[(p0 + x) * 4 + 1] << 8) | imageData[(p0 + x) * 4];
      }
      continue;
    }
    const r0 = idx * REC;
    const exitX = rec[r0];
    const exitY = rec[r0 + 1];
    const ivx = rec[r0 + 2];
    const ivy = rec[r0 + 3];
    const ux = rec[r0 + 4];
    const uy = rec[r0 + 5];
    const left0 = budget[idx];
    const edgeN = size * Q + 1;
    built.fill(0, 0, 2 * edgeN);

    for (let y = by0; y < yEnd; y++) {
      for (let x = bx0; x < xEnd; x++) {
        const o = (y * width + x) * 4;
        const lr = imageData[o];
        const lg = imageData[o + 1];
        const lb = imageData[o + 2];
        let sr, sg, sb;
        const px = x + 0.5;
        const py = y + 0.5;
        const tx = (exitX - px) * ivx;
        const ty = (exitY - py) * ivy;
        const tMin = Math.min(tx, ty);
        if (left0 <= tMin + 0.01) {
          // Budget runs out inside the block: everything lands on the end point.
          const nx = px + ux * left0;
          const ny = py + uy * left0;
          const i = nx < 0 || ny < 0 || nx > maxX || ny > maxY ? o : (ny | 0) * W4 + (nx | 0) * 4;
          sr = imageData[i];
          sg = imageData[i + 1];
          sb = imageData[i + 2];
        } else {
          const step = tMin + 0.01;
          const ex = px + ux * step;
          const ey = py + uy * step;
          if (ex < 0 || ey < 0 || ex > maxX || ey > maxY) {
            sr = lr;
            sg = lg;
            sb = lb;
          } else {
            const ie = (ey | 0) * W4 + (ex | 0) * 4;
            const er = imageData[ie];
            const eg = imageData[ie + 1];
            const eb = imageData[ie + 2];
            if (rec[blockAt(ex, ey) * REC + 6] < 0.5) {
              sr = er;
              sg = eg;
              sb = eb;
            } else {
              // Tail slot from the quantized exit-edge crossing.
              let j, qx, qy;
              if (tx < ty) {
                const k = Math.min(size * Q, Math.max(0, Math.round((py + uy * tx - by0) * Q)));
                j = k;
                qx = exitX + ux * 0.01;
                qy = by0 + k / Q + uy * 0.01;
              } else {
                const k = Math.min(size * Q, Math.max(0, Math.round((px + ux * ty - bx0) * Q)));
                j = edgeN + k;
                qx = bx0 + k / Q + ux * 0.01;
                qy = exitY + uy * 0.01;
              }
              if (!built[j]) {
                if (qx < 0 || qy < 0 || qx > maxX || qy > maxY) {
                  qx = ex;
                  qy = ey;
                }
                buildTail(j, qx, qy);
              }
              const kept1 = fastExp(logKeep * step);
              const left1 = left0 - step;
              const n = tailN[j];
              const base = j * MAXT * SEG;
              let m = 0;
              while (m < n && left1 >= segs[base + m * SEG]) m++;
              let tr, tg, tb;
              if (m === n) {
                tr = tailEnd[j * 3];
                tg = tailEnd[j * 3 + 1];
                tb = tailEnd[j * 3 + 2];
              } else {
                const q = base + m * SEG;
                const d = left1 - (m > 0 ? segs[q - SEG] : 0);
                let sx = segs[q + 5] + segs[q + 7] * d;
                let sy = segs[q + 6] + segs[q + 8] * d;
                if (sx < 0 || sy < 0 || sx > maxX || sy > maxY) {
                  sx = segs[q + 5];
                  sy = segs[q + 6];
                }
                const i = (sy | 0) * W4 + (sx | 0) * 4;
                const R = segs[q + 4];
                tr = segs[q + 1] + R * imageData[i];
                tg = segs[q + 2] + R * imageData[i + 1];
                tb = segs[q + 3] + R * imageData[i + 2];
              }
              const w1 = 1 - kept1;
              sr = er * w1 + tr * kept1;
              sg = eg * w1 + tg * kept1;
              sb = eb * w1 + tb * kept1;
            }
          }
        }

        // Generation loss: pull toward a coarse palette.
        sr += ((Math.floor(sr * qScale) + 0.5) * qInv - sr) * quantAmount;
        sg += ((Math.floor(sg * qScale) + 0.5) * qInv - sg) * quantAmount;
        sb += ((Math.floor(sb * qScale) + 0.5) * qInv - sb) * quantAmount;
        const r = lr + (sr - lr) * h;
        const g = lg + (sg - lg) * h;
        const b = lb + (sb - lb) * h;
        out32[o >> 2] = 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
      }
    }
  }
}

function clamp255(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}

// exp(x) for x <= 0: exp(x / 16) by a degree-4 Taylor series, squared four
// times. Relative error stays below 1e-6 down to x = -4 (keep factors only).
function fastExp(x) {
  const t = x * 0.0625;
  let e = 1 + t * (1 + t * (0.5 + t * (1 / 6 + t * (1 / 24))));
  e *= e;
  e *= e;
  e *= e;
  return e * e;
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
