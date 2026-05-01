import { setupRenderer, randInt, randFloat } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const lowPoly = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const config = rendererConfig.lowPoly;

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const cells = randInt(config.cells, random);
  const jitter = randFloat(config.jitter, random);
  const cw = canvas.width / cells;
  const ch = canvas.height / cells;

  // Jittered grid of vertices (edges pinned so canvas is fully covered)
  const pts = [];
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i <= cells; i++) {
      const jx = i > 0 && i < cells ? (random() - 0.5) * cw * jitter : 0;
      const jy = j > 0 && j < cells ? (random() - 0.5) * ch * jitter : 0;
      pts.push([i * cw + jx, j * ch + jy]);
    }
  }

  const sampleAt = (x, y) => {
    const sx = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
    const sy = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));
    const idx = (sy * canvas.width + sx) * 4;
    return `rgb(${src.data[idx]},${src.data[idx + 1]},${src.data[idx + 2]})`;
  };

  const fillTri = (a, b, c) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    ctx.fillStyle = ctx.strokeStyle = sampleAt(cx, cy);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const stride = cells + 1;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const tl = pts[j * stride + i];
      const tr = pts[j * stride + i + 1];
      const bl = pts[(j + 1) * stride + i];
      const br = pts[(j + 1) * stride + i + 1];
      if (random() < 0.5) {
        fillTri(tl, tr, bl);
        fillTri(tr, br, bl);
      } else {
        fillTri(tl, tr, br);
        fillTri(tl, br, bl);
      }
    }
  }
};

lowPoly.displayName = "lowPoly";
export default lowPoly;
