import { useRef, useEffect, useState, memo } from "react";
import { renderQueue } from "./renderQueue";

const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

function Canvas({ image, renderFn, seed, onDownload, downloadMeta }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // IntersectionObserver to detect when canvas is in viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: "100px", // Start rendering slightly before visible
        threshold: 0.01,
      }
    );

    observer.observe(container);

    return () => {
      observer.unobserve(container);
    };
  }, []);

  // Render once the canvas enters the viewport
  useEffect(() => {
    if (!isVisible || isRendered || !canvasRef.current || !renderFn) {
      return;
    }

    let cancelled = false;

    const doRender = async () => {
      if (cancelled || !canvasRef.current) return;
      try {
        const result = renderFn({ canvas: canvasRef.current, image, seed });
        if (result instanceof Promise) await result;
        if (!cancelled) setIsRendered(true);
      } catch (error) {
        console.error("Rendering error:", error);
      }
    };

    if (renderFn.isAsync) {
      // Worker renderers are already gated by the worker pool — no need to
      // also occupy a renderQueue slot (that would block sync renderers while
      // we idle waiting on a worker).
      doRender();
    } else {
      // Sync renderers run on the main thread; limit concurrency and defer
      // to idle time so scroll stays smooth.
      renderQueue.request(
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
    };
  }, [isVisible, isRendered, renderFn, image, seed]);

  const handleClick = () => {
    if (onDownload && canvasRef.current) {
      onDownload(canvasRef.current, downloadMeta);
    }
  };

  // Handle keyboard activation for accessibility
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  // Calculate aspect ratio for placeholder
  const aspectRatio = image ? image.width / image.height : 1;
  const maxWidth = 600; // matches CSS max-width
  const maxHeight = 600;

  let width, height;
  if (aspectRatio > 1) {
    // Landscape
    width = maxWidth;
    height = maxWidth / aspectRatio;
  } else {
    // Portrait or square
    height = maxHeight;
    width = maxHeight * aspectRatio;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
        minHeight: `${height}px`,
      }}
    >
      {!isRendered && <div className="canvas__skeleton" />}
      <canvas
        ref={canvasRef}
        className="canvas"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label="Click to download rendered image"
        style={{ opacity: isRendered ? 1 : 0, transition: "opacity 0.3s" }}
      />
    </div>
  );
}

export default memo(Canvas);
