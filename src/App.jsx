import { useEffect, useMemo, useRef } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import { rendererConfig } from "./renderers";
import { createSeededRandom } from "./utils/math";
import { workerPool } from "./workers/pool";
import useImageLoader from "./hooks/useImageLoader";
import useDragAndDrop from "./hooks/useDragAndDrop";
import useInfiniteScroll from "./hooks/useInfiniteScroll";
import { Upload } from "feather-icons-react";

// Generate a consistent hash from seed using full 32-bit range
function generateSeedHash(seed) {
  return (seed >>> 0).toString(36).padStart(7, "0");
}

function App() {
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);
  // Terminate worker pool on unmount
  useEffect(() => () => workerPool.terminate(), []);

  const { allImages, availableImages, availableImageIds, loadFiles, toggleImageAvailability } =
    useImageLoader();
  const { isDragging } = useDragAndDrop(loadFiles);
  const { visibleCount: visibleCanvasCount, reset: resetScroll } =
    useInfiniteScroll(sentinelRef, availableImages.length > 0);

  // Get all enabled renderers from config (memoized)
  const enabledRenderers = useMemo(
    () => Object.keys(rendererConfig).map((name) => renderers[name]),
    []
  );

  // Parse query parameter for hardcoded renderer(s) - supports comma-separated list (memoized)
  const filteredRenderers = useMemo(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const rendererParam = queryParams.get("renderer");
    if (!rendererParam) return null;
    const matched = rendererParam
      .split(",")
      .map((name) => renderers[name.trim()])
      .filter(Boolean);
    return matched.length > 0 ? matched : null;
  }, []);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    loadFiles(files);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleToggleImage = (img) => {
    toggleImageAvailability(img);
    resetScroll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Pre-compute canvas assignments using seeded randomness
  const rendererPool = filteredRenderers || enabledRenderers;

  const canvasAssignments = useMemo(() => {
    if (availableImages.length === 0 || rendererPool.length === 0) return [];

    const random = createSeededRandom(visibleCanvasCount * 0x1337);
    return Array.from({ length: visibleCanvasCount }, (_, index) => {
      const imageIndex = Math.floor(random() * availableImages.length);
      const seed = Math.floor(random() * 0xffffffff);
      const rendererRandom = createSeededRandom(seed);
      const rendererIndex = Math.floor(rendererRandom() * rendererPool.length);

      // Precompute retry data so we don't need an inline callback
      const retrySeed = seed ^ (0xdeadbeef + index);
      const retryRandom = createSeededRandom(retrySeed);
      const retryRendererIndex = Math.floor(retryRandom() * rendererPool.length);

      return {
        image: availableImages[imageIndex],
        seed,
        renderer: rendererPool[rendererIndex],
        retrySeed,
        retryRenderer: rendererPool[retryRendererIndex],
      };
    });
  }, [visibleCanvasCount, availableImages, rendererPool]);

  return (
    <>
      {isDragging && (
        <div className="dropzone-overlay">
          <div className="dropzone-overlay__border">
            <div className="dropzone-overlay__content">Drop images here</div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg"
        multiple
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <nav className="nav" aria-label="Image controls">
        <div className="nav__container">
          <div className="nav__controls">
            <div className="nav__thumbnails" role="toolbar" aria-label="Image selection">
              <button
                className="nav__thumbnail nav__thumbnail--upload"
                onClick={handleUploadClick}
                aria-label="Upload new images"
                type="button"
              >
                <Upload size={16} />
              </button>
              {allImages
                .slice()
                .reverse()
                .map((img) => {
                  const isAvailable = availableImageIds.has(img.id);
                  return (
                  <button
                    key={img.id}
                    className={`nav__thumbnail ${
                      isAvailable
                        ? "nav__thumbnail--active"
                        : "nav__thumbnail--inactive"
                    }`}
                    onClick={() => handleToggleImage(img)}
                    aria-label={`${isAvailable ? "Disable" : "Enable"} ${img.filename || "image"}`}
                    aria-pressed={isAvailable}
                    type="button"
                    style={{
                      backgroundImage: `url(${img.element.src})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  );
                })}
            </div>
          </div>
        </div>
      </nav>

      {canvasAssignments.length > 0 && (
        <>
          <div className="canvas-grid" role="grid" aria-label="Generated artwork grid">
            {canvasAssignments.map(({ image: img, seed, renderer, retrySeed, retryRenderer }, index) => {
              const hash = generateSeedHash(seed);

              return (
                <div key={`${seed}-${index}`} className="canvas-grid__item" role="gridcell">
                  <Canvas
                    image={img.element}
                    renderFn={renderer}
                    seed={seed}
                    retryRenderFn={retryRenderer}
                    retrySeed={retrySeed}
                    onClick={(canvas) => {
                      const mimeType = img.mimeType || "image/png";
                      const quality =
                        mimeType === "image/jpeg" ? 0.95 : undefined;

                      canvas.toBlob(
                        (blob) => {
                          if (!blob) return;
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;

                          const extension =
                            mimeType === "image/jpeg" ? "jpg" : "png";

                          if (img.filename) {
                            const nameWithoutExt = img.filename.replace(
                              /\.(jpe?g|png)$/i,
                              ""
                            );
                            link.download = `${nameWithoutExt}-minipix-${renderer.displayName}-${hash}.${extension}`;
                          } else {
                            link.download = `canvas-${index + 1}-minipix-${renderer.displayName}-${hash}.${extension}`;
                          }

                          link.click();
                          URL.revokeObjectURL(url);
                        },
                        mimeType,
                        quality
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div ref={sentinelRef} style={{ height: "1px" }} />
        </>
      )}
    </>
  );
}

export default App;
