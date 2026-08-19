import {
  setupRenderer,
  randInt,
  randFloat,
  downsampleImage,
  computeOrientationField,
} from "../utils/index.js";
import { rendererConfig } from "./config.js";

const ACCENTS = ["#ffffff", "#ff3b30", "#39ff14", "#00e5ff", "#ffe600", "#ff2bd6"];

/**
 * Vector-field overlay in the style of an optical-flow visualisation, but
 * driven by the image's own structure: the canvas is divided into a grid, the
 * edge orientation is sampled at each cell centre, and an arrow is drawn
 * pointing either across edges (toward the brighter side) or along them.
 * Arrow length follows edge strength; flat cells collapse to dots.
 */
const arrowField = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const config = rendererConfig.arrowField;
  const { width, height } = canvas;

  const cols = randInt(config.cols, random);
  const darken = randFloat(config.darken, random);
  const useHue = random() < config.hueProbability;
  const alongEdges = random() < config.tangentProbability;
  const accent = ACCENTS[Math.floor(random() * ACCENTS.length)];

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, width, height);

  const cell = width / cols;
  const rows = Math.ceil(height / cell);
  const ds = downsampleImage(src.data, width, height, Math.min(512, cols * 4));
  const field = computeOrientationField(ds.lum, ds.w, ds.h, 2);
  const fsx = ds.w / width;
  const fsy = ds.h / height;

  ctx.fillStyle = `rgba(0, 0, 0, ${darken})`;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, cell * 0.08);
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;

  const headLen = Math.max(2, cell * 0.22);
  const dotRadius = Math.max(1, cell * 0.06);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      if (cy > height) continue;
      const fx = Math.min(ds.w - 1, (cx * fsx) | 0);
      const fy = Math.min(ds.h - 1, (cy * fsy) | 0);
      const fi = fy * ds.w + fx;
      const strength = field.strength[fi];
      const vx = alongEdges ? field.tx[fi] : field.nx[fi];
      const vy = alongEdges ? field.ty[fi] : field.ny[fi];

      if (useHue) {
        const hue = ((Math.atan2(vy, vx) / (Math.PI * 2)) * 360 + 360) % 360;
        ctx.strokeStyle = ctx.fillStyle = `hsl(${hue.toFixed(0)}, 90%, 62%)`;
      }

      if (strength < 0.15) {
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const len = cell * (0.25 + 0.65 * strength);
      const x0 = cx - vx * len * 0.5;
      const y0 = cy - vy * len * 0.5;
      const x1 = cx + vx * len * 0.5;
      const y1 = cy + vy * len * 0.5;
      // Arrow head: two strokes swept back from the tip.
      const hx = -vx * headLen;
      const hy = -vy * headLen;
      const px = -vy * headLen * 0.55;
      const py = vx * headLen * 0.55;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.moveTo(x1 + hx + px, y1 + hy + py);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + hx - px, y1 + hy - py);
      ctx.stroke();
    }
  }
};

arrowField.displayName = "arrowField";

export default arrowField;
