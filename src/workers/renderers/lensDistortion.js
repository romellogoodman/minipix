import { randInt, randFloat, createNoise2D } from "../utils.js";

// Lens fields are evaluated on a grid (about 220 cells across the image
// height, 4-16 px apart) and interpolated in between.
const GRID_CELLS = 220;

/**
 * Spectral lens (after Paper Shaders' lens-distortion). Geometry is warped
 * by a barrel (tan) or pincushion (atan) lens about a centre, then each
 * pixel gathers a fan of taps along a spread axis — a fixed direction
 * blending into a radial burst — with every tap weighted toward its own hue,
 * so the image separates into shifted rainbow layers. Focus masks calm the
 * centre and edges, swirl twists the fan, and noise can scatter its
 * direction. Works in height units like the shader (x scaled by aspect).
 */
export default function lensDistortion({ imageData, width, height, config, random, outputData }) {
  const spread = randFloat(config.spread, random);
  const bulgeMag = randFloat(config.bulge, random);
  const bulge = random() < config.pincushionProbability ? -bulgeMag : bulgeMag;
  const angle = random() * Math.PI * 2;
  const perspective = randFloat(config.perspective, random);
  const bias = randFloat(config.bias, random);
  const count = randInt(config.count, random);
  const dispersion = randFloat(config.dispersion, random);
  const dispersionShift = randFloat(config.dispersionShift, random);
  const hueBase = random() + 0.5;
  const focusCenter = randFloat(config.focusCenter, random);
  const focusEdges = randFloat(config.focusEdges, random);
  const swirl = randFloat(config.swirl, random);
  // Every draw is unconditional so pinning never shifts the RNG sequence.
  const useNoise = random() < config.noiseProbability;
  const noiseRoll = randFloat(config.noise, random);
  const noiseFreq = randFloat(config.noiseFrequency, random) * 18;
  const useCircle = random() < config.circleProbability;
  const circleRoll = 0.6 + 0.4 * random();
  const noiseAmt = useNoise ? noiseRoll : 0;
  const lensCircle = useCircle ? circleRoll : 0;
  const centerU = 0.35 + random() * 0.3;
  const centerV = 0.35 + random() * 0.3;
  const noise2D = createNoise2D(random);

  const H = height;
  const aspect = width / height;
  const invAspect = 1 / aspect;
  const inradius = 0.5 * Math.min(aspect, 1);
  const outradius = 0.5 * Math.hypot(aspect, 1);
  const invInradius = 1 / inradius;
  const reach = 0.7 * Math.pow(spread, 1.3 + 2.7 * spread);
  const maxLen = (outradius + reach) * invInradius;
  const cX = centerU * aspect; // centre in height units
  const cY = centerV;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const biasPower = 1 + 2 * Math.abs(bias);
  const biasNeg = bias < 0;
  const bulgeAmt = Math.abs(bulge) * (bulge > 0 ? 1.4 : 1.2);
  const tanBulge = Math.tan(bulgeAmt);
  const focusR = inradius + (outradius - inradius) * focusCenter;
  const circleBand = inradius * (0.03 + 0.17 * 0.5 * (bulge + 1));
  const halfBoxX = aspect * 0.5;
  const boxOffX = (centerU - 0.5) * aspect;
  const boxOffY = centerV - 0.5;
  const swirlBase = swirl * 0.4 * Math.PI * spread;

  // Per tap-count tables: fan position and hue colour of each layer.
  const fanPos = [];
  const hue = [];
  const hueSum = [];
  for (let n = 0; n <= count; n++) {
    const fp = new Float64Array(n);
    const hc = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t0 = i / Math.max(n - 1, 1);
      const curved = Math.pow(biasNeg ? 1 - t0 : t0, biasPower);
      fp[i] = 1 - 2 * (biasNeg ? 1 - curved : curved);
      const h = hueBase + i / n;
      for (let c = 0; c < 3; c++) {
        // Smoothed RGB rainbow from the hue wheel.
        const raw = h * 6 + (c === 0 ? 0 : c === 1 ? 4 : 2);
        const m = raw - 6 * Math.floor(raw / 6);
        const k = Math.min(1, Math.max(0, Math.abs(m - 3) - 1));
        hc[i * 3 + c] = k * k * (3 - 2 * k);
      }
    }
    fanPos.push(fp);
    hue.push(hc);
    const hs = [0, 0, 0];
    for (let i = 0; i < n * 3; i++) hs[i % 3] += hc[i];
    hueSum.push(hs);
  }

  const tap = new Float32Array(3);
  const maxX = width - 1;
  const maxY = height - 1;
  const W4 = width * 4;

  // Per-pixel lens fields for pixel (x, y), written to out[j..j+14]: the tap
  // position polynomial, dispersion, fade and tap count. They are smooth, so
  // they are evaluated on a coarse grid and bilinearly interpolated (the tap
  // count is taken from the cell's top-left corner).
  const fieldAt = (x, y, out, j) => {
    const fx = (x + 0.5) / H - cX;
    const fy = (y + 0.5) / H - cY;
    const radius = Math.sqrt(fx * fx + fy * fy);
    const rSafe = Math.max(radius, 1e-5);

    // Lens warp: barrel (bulge > 0) or pincushion.
    let bulgeFade = 1;
    let wx = fx;
    let wy = fy;
    if (bulge !== 0) {
      const rn = rSafe / inradius;
      let map;
      if (bulge > 0) {
        bulgeFade = 1 - smoothstep(1.45, 1.53, rn * bulgeAmt);
        map = Math.tan(Math.min(rn * bulgeAmt, 1.53)) / tanBulge;
      } else {
        map = Math.atan(rn * tanBulge) / bulgeAmt;
      }
      const s = map / rn;
      wx *= s;
      wy *= s;
    }
    if (lensCircle > 0) {
      // Squeeze everything outside the inscribed circle so the outline rounds off.
      const wr = Math.sqrt(wx * wx + wy * wy);
      const dx = wx / Math.max(wr, 1e-5);
      const dy = wy / Math.max(wr, 1e-5);
      const rBox = Math.min(
        (halfBoxX - Math.sign(dx) * boxOffX) / Math.max(Math.abs(dx), 1e-4),
        (0.5 - Math.sign(dy) * boxOffY) / Math.max(Math.abs(dy), 1e-4)
      );
      const over = smoothstep(0, 1, (wr - (inradius - circleBand)) / circleBand);
      const g = wr + (rBox - inradius) * Math.pow(over, 14);
      const nr = wr + (g - wr) * lensCircle;
      wx = dx * nr;
      wy = dy * nr;
    }
    const baseX = wx + cX;
    const baseY = wy + cY;

    // Spread axis: uniform direction → radial burst, shaped by the focus masks.
    const radialLen = radius * invInradius;
    const rs = invInradius * Math.min(1, maxLen / Math.max(radialLen, 1e-6));
    const rdx = fx * rs;
    const rdy = fy * rs;
    const circleMaxing = lensCircle > 0
      ? smoothstep(inradius * 0.8, inradius, radius) * lensCircle * lensCircle * lensCircle
      : 0;
    let sdx = ux + (rdx - ux) * perspective;
    let sdy = uy + (rdy - uy) * perspective;
    sdx += (rdx - sdx) * circleMaxing;
    sdy += (rdy - sdy) * circleMaxing;
    const absU = Math.abs(baseX * invAspect - 0.5);
    const absV = Math.abs(baseY - 0.5);
    const inner = 1 + (smoothstep(0, focusR, radius) - 1) * focusCenter;
    const boxDist = Math.max(absU, absV) * 2;
    const outer = 1 - Math.min(boxDist, 1) * focusEdges;
    let strength = inner * outer *
      (1 + ((0.15 + (0.03 - 0.15) * Math.max(-bulge, 0)) - 1) * circleMaxing);
    const outU = Math.max(absU - 0.5, 0);
    const outV = Math.max(absV - 0.5, 0);
    const margin = Math.max(reach * Math.sqrt(sdx * sdx + sdy * sdy) * (1 - lensCircle), 2 / H);
    strength *= 1 - smoothstep(0, margin, Math.sqrt(outU * outU + outV * outV));
    let ax = sdx * reach * strength;
    let ay = sdy * reach * strength;
    if (noiseAmt > 0) {
      const turn = noise2D(fx * noiseFreq, fy * noiseFreq) * noiseAmt;
      const tc = Math.cos(turn);
      const ts = Math.sin(turn);
      const nx = tc * ax + ts * ay;
      ay = -ts * ax + tc * ay;
      ax = nx;
    }

    // Dispersion: stronger at the centre or the edges depending on the shift.
    const icMask = 1 - smoothstep(0.5 * inradius, 1.1 * inradius, radius);
    const dOut = clamp01(1 + dispersionShift);
    const dIn = clamp01(1 - dispersionShift);
    const dispPower = Math.pow(dispersion * (dOut + (dIn - dOut) * icMask), 0.8);
    const warpedRadius = Math.sqrt(wx * wx + wy * wy);
    const swirlAngle = swirlBase * strength * Math.min(1, inradius / Math.max(warpedRadius, 1e-4));

    // Adaptive tap count: about one tap per pixel of fan travel.
    const fanPx = (2 * Math.sqrt(ax * ax + ay * ay) + Math.abs(swirlAngle) * warpedRadius) * H;
    // Tap positions R(θp)·(B + A·p) as a polynomial in p (the Taylor series
    // of the rotation, through p^5), in pixels; J(x, y) = (−y, x).
    const bx = wx * H;
    const by = wy * H;
    const hax = ax * H;
    const hay = ay * H;
    const th = swirlAngle;
    const th2 = th * th;
    const q2 = -0.5 * th2;
    const q3 = (th2 * th) / 6;
    const q4 = (th2 * th2) / 24;
    const q5 = (th2 * th2 * th) / 120;
    out[j] = (wx + cX) * H - 0.5;
    out[j + 1] = (wy + cY) * H - 0.5;
    out[j + 2] = hax - th * by;
    out[j + 3] = hay + th * bx;
    out[j + 4] = q2 * bx - th * hay;
    out[j + 5] = q2 * by + th * hax;
    out[j + 6] = q2 * hax + q3 * by;
    out[j + 7] = q2 * hay - q3 * bx;
    out[j + 8] = q4 * bx + q3 * hay;
    out[j + 9] = q4 * by - q3 * hax;
    out[j + 10] = -q5 * by + q4 * hax;
    out[j + 11] = q5 * bx + q4 * hay;
    out[j + 12] = dispPower;
    out[j + 13] = bulgeFade;
    out[j + 14] = Math.min(count, Math.max(2, Math.ceil(fanPx * biasPower) + 1));
  };

  const NF = 15;
  const S = Math.max(4, Math.min(16, Math.round(height / GRID_CELLS)));
  const gw = Math.ceil((width - 1) / S) + 2;
  let rowA = new Float64Array(gw * NF);
  let rowB = new Float64Array(gw * NF);
  const rowY = new Float64Array(gw * NF);
  const fillRow = (gy, buf) => {
    for (let gx = 0; gx < gw; gx++) fieldAt(gx * S, gy * S, buf, gx * NF);
  };
  let rowAy = 0;
  fillRow(0, rowA);
  fillRow(1, rowB);
  const invS = 1 / S;
  // Powers p..p^5 of each tap's fan position, per tap count.
  const pows = fanPos.map((fp) => {
    const t = new Float64Array(fp.length * 5);
    for (let i = 0; i < fp.length; i++) {
      const p = fp[i];
      t[i * 5] = p;
      t[i * 5 + 1] = p * p;
      t[i * 5 + 2] = p * p * p;
      t[i * 5 + 3] = p * p * p * p;
      t[i * 5 + 4] = p * p * p * p * p;
    }
    return t;
  });
  const out32 = new Uint32Array(outputData.buffer, outputData.byteOffset, width * height);
  const accR = new Float64Array(S);
  const accG = new Float64Array(S);
  const accB = new Float64Array(S);
  const accC = new Float64Array(S);

  for (let y = 0; y < height; y++) {
    const gy = (y / S) | 0;
    while (rowAy < gy) {
      const t = rowA;
      rowA = rowB;
      rowB = t;
      rowAy++;
      fillRow(rowAy + 1, rowB);
    }
    const vy = (y - gy * S) * invS;
    for (let i = 0; i < gw * NF; i++) rowY[i] = rowA[i] + (rowB[i] - rowA[i]) * vy;
    for (let gx = 0; gx * S < width; gx++) {
      const j = gx * NF;
      const xEnd = Math.min(width, gx * S + S);
      let bulgeFade = rowY[j + 13];
      const dFade = (rowY[j + NF + 13] - bulgeFade) * invS;
      // Dispersion is held per cell (it varies over hundreds of px), so each
      // tap's channel weights are cell constants.
      const dispPower = rowY[j + 12];
      const n = j + NF;
      const taps = (vy < 0.5 ? rowA : rowB)[j + 14] | 0;
      const pw = pows[taps];
      const hc = hue[taps];
      const hs = hueSum[taps];
      const x0 = gx * S;
      const nPix = xEnd - x0;
      accR.fill(0);
      accG.fill(0);
      accB.fill(0);
      accC.fill(0);
      let fullCover = 0;
      // Tap-major: a tap's position is linear in x across the cell (the
      // coefficients are interpolated linearly), so it advances by a constant.
      for (let i = 0; i < taps; i++) {
        const q = i * 5;
        const p1 = pw[q], p2 = pw[q + 1], p3 = pw[q + 2], p4 = pw[q + 3], p5 = pw[q + 4];
        let px = rowY[j] + rowY[j + 2] * p1 + rowY[j + 4] * p2 + rowY[j + 6] * p3 +
          rowY[j + 8] * p4 + rowY[j + 10] * p5;
        let py = rowY[j + 1] + rowY[j + 3] * p1 + rowY[j + 5] * p2 + rowY[j + 7] * p3 +
          rowY[j + 9] * p4 + rowY[j + 11] * p5;
        const pxR = rowY[n] + rowY[n + 2] * p1 + rowY[n + 4] * p2 + rowY[n + 6] * p3 +
          rowY[n + 8] * p4 + rowY[n + 10] * p5;
        const pyR = rowY[n + 1] + rowY[n + 3] * p1 + rowY[n + 5] * p2 + rowY[n + 7] * p3 +
          rowY[n + 9] * p4 + rowY[n + 11] * p5;
        const dpx = (pxR - px) * invS;
        const dpy = (pyR - py) * invS;
        const w0 = 1 - dispPower * hc[i * 3];
        const w1 = 1 - dispPower * hc[i * 3 + 1];
        const w2 = 1 - dispPower * hc[i * 3 + 2];
        const pxE = px + dpx * (nPix - 1);
        const pyE = py + dpy * (nPix - 1);
        if (px >= 0 && py >= 0 && px < maxX && py < maxY &&
            pxE >= 0 && pyE >= 0 && pxE < maxX && pyE < maxY) {
          // Whole run inside the image: nearest-pixel taps (the fan averages
          // many taps, which hides the sub-pixel position), full cover.
          px += 0.5;
          py += 0.5;
          for (let m = 0; m < nPix; m++) {
            const ii = (py | 0) * W4 + (px | 0) * 4;
            accR[m] += imageData[ii] * w0;
            accG[m] += imageData[ii + 1] * w1;
            accB[m] += imageData[ii + 2] * w2;
            px += dpx;
            py += dpy;
          }
          fullCover++;
        } else {
          for (let m = 0; m < nPix; m++) {
            // Anti-aliased frame: taps outside the image read as white with no cover.
            const frame =
              clamp01(px + 1) * clamp01(width - px) * clamp01(py + 1) * clamp01(height - py);
            let tr = 255, tg = 255, tb = 255;
            if (frame > 0) {
              sampleBilinear(imageData, width, height, px, py, tap);
              const inv = 255 * (1 - frame);
              tr = tap[0] * frame + inv;
              tg = tap[1] * frame + inv;
              tb = tap[2] * frame + inv;
            }
            accR[m] += tr * w0;
            accG[m] += tg * w1;
            accB[m] += tb * w2;
            accC[m] += frame;
            px += dpx;
            py += dpy;
          }
        }
      }
      const invR = 1 / Math.max(taps - dispPower * hs[0], 1e-4);
      const invG = 1 / Math.max(taps - dispPower * hs[1], 1e-4);
      const invB = 1 / Math.max(taps - dispPower * hs[2], 1e-4);
      const invTaps = 1 / taps;
      let o = y * width + x0;
      for (let m = 0; m < nPix; m++, o++) {
        const r = accR[m] * invR;
        const g = accG[m] * invG;
        const b = accB[m] * invB;
        // Reconstruct coverage over white, then composite over black.
        const ground = r < g ? (r < b ? r : b) : g < b ? g : b;
        const alpha = Math.max((fullCover + accC[m]) * invTaps, 1 - ground / 255);
        const lift = 255 * (1 - alpha);
        out32[o] = 0xff000000 |
          (to255((b - lift) * bulgeFade) << 16) |
          (to255((g - lift) * bulgeFade) << 8) |
          to255((r - lift) * bulgeFade);
        bulgeFade += dFade;
      }
    }
  }
}

function to255(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, v) {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// Bilinear RGB sample (coordinates clamped to the image), written to dst.
function sampleBilinear(src, width, height, x, y, dst) {
  const maxX = width - 1;
  const maxY = height - 1;
  if (x < 0) x = 0; else if (x > maxX) x = maxX;
  if (y < 0) y = 0; else if (y > maxY) y = maxY;
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
