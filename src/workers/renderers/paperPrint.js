import { randFloat, createNoise2D, createSeededRandom } from "../utils.js";

// Paper stocks (multiplied under the print, so white becomes the paper).
const PAPERS = [
  [250, 243, 226], // cream
  [244, 236, 214], // ivory
  [238, 232, 222], // warm grey
  [236, 240, 240], // cool white
  [242, 226, 200], // aged manila
];

// Running-sum box blur (radius 1) of a single-channel buffer, in place.
function blur1(buf, tmp, w, h) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (buf[row + Math.max(0, x - 1)] + buf[row + x] + buf[row + Math.min(w - 1, x + 1)]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w, dn = Math.min(h - 1, y + 1) * w, row = y * w;
    for (let x = 0; x < w; x++) buf[row + x] = (tmp[up + x] + tmp[row + x] + tmp[dn + x]) / 3;
  }
}

export default function paperPrint({ imageData, width, height, config, random, outputData }) {
  const minDim = Math.min(width, height);
  // Grade.
  const contrast = randFloat(config.contrast, random);
  const fade = randFloat(config.fade, random);
  const saturation = randFloat(config.saturation, random);
  const warmth = randFloat(config.warmth, random); // −1 cool … +1 warm
  const splitAmount = randFloat(config.splitTone, random);
  const shadowHue = random() * Math.PI * 2;
  // Vignette, tinted toward a deep brown.
  const vignette = randFloat(config.vignette, random);
  const vRadius = randFloat(config.vignetteRadius, random);
  const vFalloff = randFloat(config.vignetteFalloff, random);
  const vcx = 0.5 + (random() - 0.5) * 0.15, vcy = 0.5 + (random() - 0.5) * 0.15;
  // Paper.
  const paper = PAPERS[Math.floor(random() * PAPERS.length)];
  const roughness = randFloat(config.roughness, random);
  const fibreDensity = randFloat(config.fibreDensity, random);
  const displacement = randFloat(config.displacement, random) * minDim / 1000;
  const tooth = randFloat(config.tooth, random);
  const foxingAmount = randFloat(config.foxing, random);
  const foxing = random() < config.foxingProbability ? foxingAmount : 0;
  // Texture building draws a variable number of values, so it gets its own
  // stream and can't shift anything above.
  const tex = createSeededRandom(Math.floor(random() * 0xffffffff));
  const noise = createNoise2D(tex);

  // Paper texture at ≤ 1600 px: cloudy formation (fbm) + short curved fibres.
  const ts = Math.max(1, Math.max(width, height) / 1600);
  const tw = Math.ceil(width / ts), th = Math.ceil(height / ts), tn = tw * th;
  const grain = new Float32Array(tn), stain = new Float32Array(tn), tmp = new Float32Array(tn);
  const unit = minDim / ts; // texture px per min-dimension
  const f0 = 14 / unit;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const n = noise(x * f0, y * f0) * 0.5 + noise(x * f0 * 2.7, y * f0 * 2.7) * 0.3 + noise(x * f0 * 7, y * f0 * 7) * 0.2;
      grain[y * tw + x] = n * 0.6;
    }
  }
  const fibres = Math.round((fibreDensity * tn) / 250);
  const fibreLen = unit * 0.012;
  for (let k = 0; k < fibres; k++) {
    let x = tex() * tw, y = tex() * th, a = tex() * Math.PI * 2;
    const bend = (tex() - 0.5) * 0.05; // gentle curl per step
    const steps = Math.ceil(fibreLen * (0.3 + tex() * 1.4) / 0.7);
    const v = (tex() < 0.6 ? 1 : -1) * (0.25 + tex() * 0.4);
    for (let s = 0; s < steps; s++) {
      const xi = x | 0, yi = y | 0;
      if (xi >= 0 && xi < tw && yi >= 0 && yi < th) grain[yi * tw + xi] += v;
      x += Math.cos(a) * 0.7; y += Math.sin(a) * 0.7; a += bend;
    }
  }
  blur1(grain, tmp, tw, th);
  // Foxing: soft rust-coloured age spots.
  const spots = Math.round(foxing * 60);
  for (let k = 0; k < spots; k++) {
    const cx = tex() * tw, cy = tex() * th, r = unit * (0.004 + tex() ** 3 * 0.03), str = 0.3 + tex() * 0.7;
    for (let y = Math.max(0, (cy - r * 2) | 0); y < Math.min(th, cy + r * 2); y++) {
      for (let x = Math.max(0, (cx - r * 2) | 0); x < Math.min(tw, cx + r * 2); x++) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
        const wobble = 1 + 0.4 * noise(x * 0.15, y * 0.15);
        stain[y * tw + x] += str * Math.exp(-d * d * wobble);
      }
    }
  }

  // Tone curve: lifted blacks, S-curve contrast, slightly rolled-off whites.
  const tone = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let c = v / 255;
    c = c + (c * c * (3 - 2 * c) - c) * (contrast - 1) * 2;
    c = Math.min(1, Math.max(0, c));
    tone[v] = fade + c * (0.97 - fade);
  }
  // White balance + split toning (shadows one hue, highlights the opposite).
  const wbR = 1 + warmth * 0.08, wbB = 1 - warmth * 0.1;
  const sR = Math.cos(shadowHue) * splitAmount, sG = Math.cos(shadowHue - 2.094) * splitAmount;
  const sB = Math.cos(shadowHue + 2.094) * splitAmount;
  const pR = paper[0] / 255, pG = paper[1] / 255, pB = paper[2] / 255;
  const aspect = width / height;
  const vIn = vRadius, vOut = vRadius + vFalloff;
  const toothScale = tooth * 0.12;
  const dispScale = displacement * ts;

  for (let y = 0; y < height; y++) {
    const ty = Math.min(th - 1, y / ts);
    const ty0 = ty | 0, ty1 = Math.min(th - 1, ty0 + 1), fy = ty - ty0;
    const vy = y / height - vcy;
    for (let x = 0; x < width; x++) {
      const tx = Math.min(tw - 1, x / ts);
      const tx0 = tx | 0, tx1 = Math.min(tw - 1, tx0 + 1), fx = tx - tx0;
      const a = ty0 * tw + tx0, b = ty0 * tw + tx1, c = ty1 * tw + tx0, d = ty1 * tw + tx1;
      const g = (grain[a] * (1 - fx) + grain[b] * fx) * (1 - fy) + (grain[c] * (1 - fx) + grain[d] * fx) * fy;
      // Displace the print along the fibre relief (its gradient).
      const gx = (grain[b] - grain[a] + grain[d] - grain[c]) * 0.5;
      const gy = (grain[c] - grain[a] + grain[d] - grain[b]) * 0.5;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + gx * dispScale)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + gy * dispScale)));
      const si = (sy * width + sx) * 4;

      let r = tone[imageData[si]], gg = tone[imageData[si + 1]], bb = tone[imageData[si + 2]];
      const l = 0.299 * r + 0.587 * gg + 0.114 * bb;
      r = l + (r - l) * saturation; gg = l + (gg - l) * saturation; bb = l + (bb - l) * saturation;
      const sh = (1 - l) * (1 - l), hl = l * l;
      r = r * wbR + (sR * sh - sR * hl) * 0.5;
      gg = gg + (sG * sh - sG * hl) * 0.5;
      bb = bb * wbB + (sB * sh - sB * hl) * 0.5;

      // Vignette toward a dark sepia, aspect-corrected like the shader.
      const vx = (x / width - vcx) * aspect;
      const dist = Math.sqrt(vx * vx + vy * vy);
      let m = (dist - vIn) / (vOut - vIn);
      m = m <= 0 ? 0 : m >= 1 ? vignette : m * m * (3 - 2 * m) * vignette;
      r += (0.16 - r) * m; gg += (0.1 - gg) * m; bb += (0.06 - bb) * m;

      // Ink on paper, fibre relief, tooth and foxing.
      const st = stain[a];
      const lit = (1 + g * roughness + (random() - 0.5) * toothScale) * 255;
      const i = (y * width + x) * 4;
      outputData[i] = r * pR * lit * (1 - st * 0.12);
      outputData[i + 1] = gg * pG * lit * (1 - st * 0.3);
      outputData[i + 2] = bb * pB * lit * (1 - st * 0.5);
      outputData[i + 3] = 255;
    }
  }
}
