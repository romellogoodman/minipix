import { useRef, useEffect, useState, memo } from "react";
import { recordDraws } from "./utils/math.js";

const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
const cancelIdle = window.cancelIdleCallback || clearTimeout;

// Fits the image's aspect ratio inside maxWidth x maxHeight without upscaling
// past its natural size.
const fitDisplaySize = (image, maxWidth, maxHeight) => {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return {
    width: Math.floor(image.width * scale),
    height: Math.floor(image.height * scale),
  };
};

function Canvas({ image, renderFn, seed, config, label, maxWidth, maxHeight, onRendered }) {
  const canvasRef = useRef(null);
  // "pending" | "done" | "error"
  const [renderState, setRenderState] = useState("pending");
  // Parameter values the render drew from its config ranges (see recordDraws).
  const drawsRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    let workerPromise = null;

    const render = async () => {
      try {
        const args = { canvas: canvasRef.current, image, seed, config };
        if (renderFn.isAsync) {
          workerPromise = renderFn(args);
          drawsRef.current = (await workerPromise) ?? {};
        } else {
          drawsRef.current = recordDraws(config ?? {}, () => renderFn(args));
        }
        if (!cancelled) setRenderState("done");
      } catch (error) {
        if (error?.message === "cancelled") return;
        console.error("Rendering error:", error);
        if (!cancelled) setRenderState("error");
      }
    };

    // Sync renderers block the main thread, so start them once the browser is
    // idle; a quick change of settings then cancels them before they start.
    // Worker renderers are cancellable while queued in the pool.
    const idle = renderFn.isAsync ? null : requestIdle(render);
    if (renderFn.isAsync) render();

    return () => {
      cancelled = true;
      if (idle !== null) cancelIdle(idle);
      workerPromise?.cancel?.();
    };
  }, [renderFn, image, seed, config]);

  // Hands the finished canvas (and its drawn parameter values) to the parent.
  useEffect(() => {
    if (renderState === "done") onRendered?.(canvasRef.current, drawsRef.current);
  }, [onRendered, renderState]);

  const { width, height } = fitDisplaySize(image, maxWidth, maxHeight);

  return (
    <div
      className="canvas__container"
      style={{ width: `${width}px`, aspectRatio: `${width} / ${height}` }}
    >
      {renderState === "pending" && <div className="canvas__skeleton" />}
      {renderState === "error" && <div className="canvas__error">render failed</div>}
      <canvas
        ref={canvasRef}
        className="canvas"
        role="img"
        aria-label={label}
        style={{ opacity: renderState === "done" ? 1 : 0 }}
      />
    </div>
  );
}

export default memo(Canvas);
