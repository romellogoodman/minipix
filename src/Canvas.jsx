import { useRef, useEffect, useState, memo } from "react";

// Global render queue to limit concurrent renders
// Use more workers on multi-core machines
const renderQueue = {
  active: 0,
  maxConcurrent: Math.max(4, navigator.hardwareConcurrency || 4),
  waiting: [],
  retryCallbacks: [], // Callbacks waiting to retry with a new renderer

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
      // Process retry queue first (failed renders get priority)
      if (this.retryCallbacks.length > 0) {
        const retry = this.retryCallbacks.shift();
        retry();
      } else if (this.waiting.length > 0) {
        const next = this.waiting.shift();
        next();
      }
    }
  },

  // Queue a retry to happen when a slot opens
  queueRetry(callback) {
    this.retryCallbacks.push(callback);
    // If there's capacity, trigger immediately
    if (this.active < this.maxConcurrent && this.retryCallbacks.length > 0) {
      const retry = this.retryCallbacks.shift();
      retry();
    }
  },
};

function Canvas({ image, renderFn, onClick, seed, onRetryNeeded }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

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

  // Progressive rendering when visible
  useEffect(() => {
    if (!isVisible || isRendered || !canvasRef.current || !renderFn) {
      return;
    }

    let cancelled = false;

    const attemptRender = async (currentRenderFn, currentSeed) => {
      if (cancelled) return false;

      try {
        // Support both sync and async renderers
        const result = currentRenderFn({ canvas: canvasRef.current, image, seed: currentSeed });
        if (result instanceof Promise) {
          await result;
        }
        return true;
      } catch (error) {
        console.error("Rendering error:", error);
        return false;
      }
    };

    const render = async () => {
      // Add to render queue to limit concurrent renders
      await renderQueue.request(async () => {
        if (cancelled) return;

        // Use requestIdleCallback for non-blocking rendering
        const idleCallback =
          window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

        await new Promise((resolve) => {
          idleCallback(() => {
            if (cancelled || !canvasRef.current) {
              resolve();
              return;
            }

            // Run the render attempt and handle result
            attemptRender(renderFn, seed).then((success) => {
              if (success) {
                setIsRendered(true);
              } else if (retryCountRef.current < maxRetries && onRetryNeeded) {
                // Request a new renderer and retry when queue has space
                retryCountRef.current++;
                renderQueue.queueRetry(() => {
                  if (cancelled) return;

                  const { newRenderFn, newSeed } = onRetryNeeded();
                  if (newRenderFn && canvasRef.current) {
                    renderQueue.request(async () => {
                      if (cancelled) return;
                      const retrySuccess = await attemptRender(newRenderFn, newSeed);
                      if (retrySuccess) {
                        setIsRendered(true);
                      }
                    });
                  }
                });
              }
              resolve();
            });
          });
        });
      });
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [isVisible, isRendered, renderFn, image, seed, onRetryNeeded]);

  const handleClick = () => {
    if (onClick && canvasRef.current) {
      onClick(canvasRef.current);
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
