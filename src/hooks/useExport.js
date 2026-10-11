import { useCallback, useEffect, useRef, useState } from "react";
import { copyCanvas, downloadCanvas } from "../utils/download.js";
import { shareLink } from "../utils/output.js";

// Download / copy-image / copy-link actions for a described output, plus a
// short-lived status message to show next to the buttons.
export default function useExport() {
  const [status, setStatus] = useState("");
  const timer = useRef(null);

  const flash = useCallback((message) => {
    setStatus(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 2400);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const download = useCallback((canvas, output) => {
    if (!canvas || !output) return;
    downloadCanvas(canvas, output.filename, output.image.mimeType);
  }, []);

  // Phones: the share sheet (Save Image / Photos) when it takes files, else a download.
  const save = useCallback(
    async (canvas, output) => {
      if (!canvas || !output) return;
      const type = output.image.mimeType;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.95));
      const file = blob && new File([blob], output.filename, { type });
      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          if (error.name !== "AbortError") flash("Sharing failed");
        }
      } else {
        download(canvas, output);
      }
    },
    [download, flash]
  );

  const copyImage = useCallback(
    async (canvas) => {
      if (!canvas) return;
      try {
        await copyCanvas(canvas);
        flash("Image copied to clipboard");
      } catch {
        flash("Clipboard unavailable in this browser");
      }
    },
    [flash]
  );

  const copyLink = useCallback(
    async (output) => {
      if (!output) return;
      const url = shareLink(output.rendererName, output.code);
      try {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      } catch {
        flash(url);
      }
    },
    [flash]
  );

  return { status, download, save, copyImage, copyLink };
}
