import { setupRenderer, calculateAdaptivePixelSize, getAverageColorInBlock } from "../utils/index.js";

// Packs r,g,b,255 into a uint32 laid out like the platform's RGBA bytes.
const packed = new Uint32Array(1);
const packedBytes = new Uint8Array(packed.buffer);
const packRGBA = (r, g, b) => {
  packedBytes[0] = r; packedBytes[1] = g; packedBytes[2] = b; packedBytes[3] = 255;
  return packed[0];
};

const pixelated = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;
  const { ctx, random } = setupRenderer(canvas, image, seed);
  const { width, height } = canvas;

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, width, height);
  const pixels = new Uint32Array(src.data.buffer, src.data.byteOffset, width * height);

  const blockSize = calculateAdaptivePixelSize(image.width, image.height, random);

  // Each block reads its own region then overwrites it, so in-place is safe.
  for (let y = 0; y < height; y += blockSize) {
    const endY = Math.min(y + blockSize, height);
    for (let x = 0; x < width; x += blockSize) {
      const c = getAverageColorInBlock(src, x, y, blockSize, width, height);
      const color = packRGBA(c.r, c.g, c.b);
      const endX = Math.min(x + blockSize, width);
      for (let by = y; by < endY; by++) {
        pixels.fill(color, by * width + x, by * width + endX);
      }
    }
  }

  ctx.putImageData(src, 0, 0);
};

pixelated.displayName = "pixelated";

export default pixelated;
