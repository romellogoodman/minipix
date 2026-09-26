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
      const url = shareLink(output.rendererName, output.hash);
      try {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      } catch {
        flash(url);
      }
    },
    [flash]
  );

  return { status, flash, download, copyImage, copyLink };
}
