import { useRef, useEffect, useState, memo } from "react";
import { renderQueue } from "./renderQueue";

const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

function downloadCanvas(canvas, filename, mimeType = "image/png") {
  const quality = mimeType === "image/jpeg" ? 0.95 : undefined;
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    mimeType,
    quality
  );
}

function Canvas({ image, renderFn, seed, rendererName, hash, filename, mimeType }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  // "pending" | "done" | "error"
  const [renderState, setRenderState] = useState("pending");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "100px", threshold: 0.01 }
    );

    observer.observe(container);
    return () => observer.unobserve(container);
  }, []);

  useEffect(() => {
    if (!isVisible || !canvasRef.current || !renderFn) return;

    let cancelled = false;
    let cancelQueue = null;
    let workerPromise = null;

    const doRender = async () => {
      if (cancelled || !canvasRef.current) return;
      try {
        const result = renderFn({ canvas: canvasRef.current, image, seed });
        if (result instanceof Promise) {
          workerPromise = result;
          await result;
        }
        if (!cancelled) setRenderState("done");
      } catch (error) {
        if (error?.message !== "cancelled") {
          console.error("Rendering error:", error);
          if (!cancelled) setRenderState("error");
        }
      }
    };

    if (renderFn.isAsync) {
      doRender();
    } else {
      cancelQueue = renderQueue.request(
        () =>
          new Promise((resolve) => {
            requestIdle(() => {
              doRender().finally(resolve);
            });
          })
      );
    }

    return () => {
      cancelled = true;
      if (cancelQueue) cancelQueue();
      if (workerPromise?.cancel) workerPromise.cancel();
    };
  }, [isVisible, renderFn, image, seed]);

  const handleClick = () => {
    if (canvasRef.current && renderState === "done") {
      downloadCanvas(canvasRef.current, filename, mimeType);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const aspectRatio = image ? image.width / image.height : 1;
  const maxDim = 600;
  const width = aspectRatio > 1 ? maxDim : maxDim * aspectRatio;
  const height = aspectRatio > 1 ? maxDim / aspectRatio : maxDim;

  return (
    <div
      ref={containerRef}
      className="canvas__container"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {renderState === "pending" && <div className="canvas__skeleton" />}
      {renderState === "error" && (
        <div className="canvas__error">
          render failed
          <span className="canvas__error-name">{rendererName}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="canvas"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`${rendererName} rendering, seed ${hash}. Press to download.`}
        style={{ opacity: renderState === "done" ? 1 : 0 }}
      />
      {renderState === "done" && (
        <span className="canvas__badge" aria-hidden="true">
          {rendererName} · {hash}
        </span>
      )}
    </div>
  );
}

export default memo(Canvas);
