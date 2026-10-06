import { randInt, randFloat, createNoise2D } from "../utils.js";

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
  for (let n = 0; n <= count; n++) {
    const fp = new Float32Array(n);
    const hc = new Float32Array(n * 3);
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
  }

  const tap = new Float32Array(3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
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
      const taps = Math.min(count, Math.max(2, Math.ceil(fanPx * biasPower) + 1));
      const fp = fanPos[taps];
      const hc = hue[taps];

      let r = 0, g = 0, b = 0, wr = 0, wg = 0, wb = 0, cover = 0;
      for (let i = 0; i < taps; i++) {
        const p = fp[i];
        let tx = baseX + ax * p - cX;
        let ty = baseY + ay * p - cY;
        if (swirlAngle !== 0) {
          const sa = swirlAngle * p;
          // Swirl angles stay under ~0.4 rad: short Taylor series beat Math.cos/sin here.
          const s2 = sa * sa;
          const sc = 1 - s2 * (0.5 - s2 / 24);
          const ss = sa * (1 - s2 * (1 / 6 - s2 / 120));
          const rx = sc * tx - ss * ty;
          ty = ss * tx + sc * ty;
          tx = rx;
        }
        const px = (tx + cX) * H - 0.5;
        const py = (ty + cY) * H - 0.5;
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
        const w0 = 1 - dispPower * hc[i * 3];
        const w1 = 1 - dispPower * hc[i * 3 + 1];
        const w2 = 1 - dispPower * hc[i * 3 + 2];
        r += tr * w0; wr += w0;
        g += tg * w1; wg += w1;
        b += tb * w2; wb += w2;
        cover += frame;
      }
      r /= Math.max(wr, 1e-4);
      g /= Math.max(wg, 1e-4);
      b /= Math.max(wb, 1e-4);
      // Reconstruct coverage over white, then composite over black.
      const ground = Math.min(r, g, b);
      const alpha = Math.max(cover / taps, 1 - ground / 255);
      const lift = 255 * (1 - alpha);
      outputData[o] = Math.max(r - lift, 0) * bulgeFade;
      outputData[o + 1] = Math.max(g - lift, 0) * bulgeFade;
      outputData[o + 2] = Math.max(b - lift, 0) * bulgeFade;
      outputData[o + 3] = 255;
    }
  }
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
