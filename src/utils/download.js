/**
 * Filename and download helpers for saving rendered canvases.
 */

/**
 * Converts a numeric seed to the 6-7 character base36 hash used in filenames.
 * @param {number} seed - The seed value (treated as unsigned 32-bit)
 * @returns {string} Base36 hash, zero-padded to 7 characters
 */
export function generateSeedHash(seed) {
  return (seed >>> 0).toString(36).padStart(7, "0");
}

/**
 * Builds the download filename: {originalname}-minipix-{renderer}-{hash}.{ext}
 * @param {{filename?: string, mimeType?: string}} img - Wrapped image record
 * @param {string} rendererName - Display name of the renderer
 * @param {string} hash - Base36 seed hash
 * @param {number} index - Canvas index, used as a fallback base name
 * @returns {string} The filename
 */
export function buildFilename(img, rendererName, hash, index) {
  const extension = img.mimeType === "image/jpeg" ? "jpg" : "png";
  const base = img.filename
    ? img.filename.replace(/\.(jpe?g|png)$/i, "")
    : `canvas-${index + 1}`;
  return `${base}-minipix-${rendererName}-${hash}.${extension}`;
}

/**
 * Downloads a canvas's current contents as an image file.
 * @param {HTMLCanvasElement} canvas - The canvas to download
 * @param {string} filename - The filename for the download
 * @param {string} [mimeType="image/png"] - Output MIME type
 */
export function downloadCanvas(canvas, filename, mimeType = "image/png") {
  const quality = mimeType === "image/jpeg" ? 0.95 : undefined;
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      // Defer revoke: revoking synchronously after click() can abort the
      // download in some browsers before they have read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    mimeType,
    quality
  );
}

/**
 * Parses a seed typed or shared by a user: a plain decimal seed, or the base36
 * hash used in filenames (e.g. "00009ix").
 * @param {string} value - Seed text
 * @returns {number|null} Unsigned 32-bit seed, or null if unparseable
 */
export function parseSeed(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  const seed = /^\d+$/.test(text) ? Number(text) : parseInt(text, 36);
  return Number.isFinite(seed) && /^[0-9a-z]+$/.test(text) ? seed >>> 0 : null;
}

/**
 * Copies a canvas's contents to the clipboard as a PNG.
 * @param {HTMLCanvasElement} canvas - The canvas to copy
 * @returns {Promise<void>}
 */
export function copyCanvas(canvas) {
  // Pass the blob promise straight to ClipboardItem so Safari keeps the
  // user-activation from the click that triggered this.
  const blob = new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty canvas"))), "image/png")
  );
  return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
