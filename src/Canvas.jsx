import { useRef, useEffect, useState } from "react";

// Global render queue to limit concurrent renders
// Use more workers on multi-core machines
const renderQueue = {
  active: 0,
  maxConcurrent: Math.max(4, navigator.hardwareConcurrency || 4),
  waiting: [],

  async request(fn) {
    if (this.active >= this.maxConcurrent) {
      // Wait for a slot to open
      await new Promise((resolve) => this.waiting.push(resolve));
    }

    this.active++;
    try {
      await fn();
    } finally {
      this.active--;
      // Process next in queue
      if (this.waiting.length > 0) {
        const next = this.waiting.shift();
        next();
      }
    }
  },
};

function Canvas({ image, renderFn, onClick, seed }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // IntersectionObserver to detect when canvas is in viewport
  useEffect(() => {
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

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  // Progressive rendering when visible
  useEffect(() => {
    if (!isVisible || isRendered || !canvasRef.current || !renderFn) {
      return;
    }

    let cancelled = false;

    const render = async () => {
      // Add to render queue to limit concurrent renders
      await renderQueue.request(async () => {
        if (cancelled) return;

        // Use requestIdleCallback for non-blocking rendering
        await new Promise(async (resolve) => {
          const idleCallback =
            window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
          idleCallback(async () => {
            if (!cancelled && canvasRef.current) {
              try {
                // Support both sync and async renderers
                const result = renderFn({ canvas: canvasRef.current, image, seed });
                if (result instanceof Promise) {
                  await result;
                }
                setIsRendered(true);
              } catch (error) {
                console.error("Rendering error:", error);
              }
            }
            resolve();
          });
        });
      });
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [isVisible, isRendered, renderFn, image, seed]);

  const handleClick = () => {
    if (onClick && canvasRef.current) {
      onClick(canvasRef.current);
    }
  };

  // Calculate aspect ratio for placeholder
  const aspectRatio = image ? image.width / image.height : 1;
  const maxWidth = 300; // matches CSS max-width
  const maxHeight = 300;

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
        style={{ opacity: isRendered ? 1 : 0, transition: "opacity 0.3s" }}
      />
    </div>
  );
}

export default Canvas;
