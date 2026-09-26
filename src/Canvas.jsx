import { useRef, useEffect, useState, memo } from "react";
import { renderQueue } from "./renderQueue";

const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

// Fits the image's aspect ratio inside maxWidth x maxHeight without upscaling
// past its natural size.
const fitDisplaySize = (image, maxWidth, maxHeight) => {
  if (!image) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return {
    width: Math.floor(image.width * scale),
    height: Math.floor(image.height * scale),
  };
};

function Canvas({
  image,
  renderFn,
  seed,
  config,
  rendererName,
  hash,
  maxWidth = 600,
  maxHeight = 600,
  scrollRoot = null,
  onRendered,
}) {
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
          // Visibility only flips on once; stop observing so scrolling a long
          // grid doesn't keep firing callbacks for already-rendered canvases.
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: "100px", threshold: 0.01 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!isVisible || !canvasRef.current || !renderFn) return;

    let cancelled = false;
    let cancelQueue = null;
    let workerPromise = null;

    const doRender = async () => {
      if (cancelled || !canvasRef.current) return;
      try {
        const result = renderFn({ canvas: canvasRef.current, image, seed, config });
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
  }, [isVisible, renderFn, image, seed, config]);

  // Hands the finished canvas to whoever exports it. Re-runs when the callback
  // is attached later (e.g. this canvas becomes the selection after rendering).
  useEffect(() => {
    if (onRendered && renderState === "done") onRendered(canvasRef.current);
  }, [onRendered, renderState]);

  const { width, height } = fitDisplaySize(image, maxWidth, maxHeight);

  return (
    <div
      ref={containerRef}
      className="canvas__container"
      style={{ width: `${width}px`, aspectRatio: `${width} / ${height}` }}
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
        role="img"
        aria-label={`${rendererName} rendering, seed ${hash}`}
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
