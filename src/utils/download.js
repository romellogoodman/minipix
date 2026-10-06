// Seed hashes and filenames (pure; the CLI uses them too), plus saving and
// copying canvases (browser only).

// Base36 hash of an unsigned 32-bit seed, zero-padded to 7 characters.
export function generateSeedHash(seed) {
  return (seed >>> 0).toString(36).padStart(7, "0");
}

// A seed typed or shared by a user: a plain decimal seed, or the base36 hash
// used in filenames (e.g. "00009ix"). Null if unparseable.
export function parseSeed(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-z]+$/.test(text)) return null;
  const seed = /^\d+$/.test(text) ? Number(text) : parseInt(text, 36);
  return Number.isFinite(seed) ? seed >>> 0 : null;
}

// {originalname}-minipix-{renderer}-{hash}.{ext}; JPEG sources stay JPEG.
export function buildFilename(image, rendererName, hash) {
  const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
  const base = image.filename.replace(/\.(jpe?g|png)$/i, "");
  return `${base}-minipix-${rendererName}-${hash}.${extension}`;
}

// Saves a blob under `filename` via a temporary link.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Deferred: revoking right after click() can abort the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCanvas(canvas, filename, mimeType = "image/png") {
  const quality = mimeType === "image/jpeg" ? 0.95 : undefined;
  canvas.toBlob((blob) => blob && downloadBlob(blob, filename), mimeType, quality);
}

export function copyCanvas(canvas) {
  // Pass the blob promise straight to ClipboardItem so Safari keeps the
  // user activation from the click that triggered this.
  const blob = new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty canvas"))), "image/png")
  );
  return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
