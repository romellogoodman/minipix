import { useMemo, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import { rendererConfig } from "./renderers";
import { createSeededRandom } from "./utils/math";
import { generateSeedHash, buildFilename } from "./utils/download.js";
import useImageLoader from "./hooks/useImageLoader";
import useDragAndDrop from "./hooks/useDragAndDrop";
import useInfiniteScroll from "./hooks/useInfiniteScroll";
import { Upload } from "feather-icons-react";

function App() {
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);

  const { allImages, availableImages, availableImageIds, loadFiles, toggleImageAvailability } =
    useImageLoader();
  const { isDragging } = useDragAndDrop(loadFiles);
  const { visibleCount: visibleCanvasCount, reset: resetScroll } =
    useInfiniteScroll(sentinelRef, availableImages.length > 0);

  const enabledRenderers = useMemo(
    () => Object.keys(rendererConfig).map((name) => renderers[name]),
    []
  );

  const filteredRenderers = useMemo(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const rendererParam = queryParams.get("renderer");
    if (!rendererParam) return null;
    const matched = rendererParam
      .split(",")
      .map((name) => renderers[name.trim()])
      .filter((r) => typeof r === "function");
    return matched.length > 0 ? matched : null;
  }, []);

  // Optional ?seed= param to reproduce a specific artwork from a shared
  // filename. Accepts the base36 hash used in filenames (e.g. "00009ix") or a
  // plain decimal seed. When present, the first canvas uses this exact seed.
  const seedOverride = useMemo(() => {
    const seedParam = new URLSearchParams(window.location.search).get("seed");
    if (!seedParam) return null;
    const decimal = /^\d+$/.test(seedParam)
      ? Number(seedParam)
      : parseInt(seedParam, 36);
    return Number.isFinite(decimal) ? decimal >>> 0 : null;
  }, []);

  // A fresh random base per page load so the grid layout differs every visit.
  // Stable for the lifetime of the mount, so scrolling extends the grid rather
  // than reshuffling already-rendered canvases.
  const [sessionSeed] = useState(() => Math.floor(Math.random() * 0xffffffff));

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    loadFiles(files);
    event.target.value = "";
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleToggleImage = (img) => {
    toggleImageAvailability(img);
    resetScroll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rendererPool = filteredRenderers || enabledRenderers;

  // Newest-first thumbnails; memoized so the copy isn't rebuilt every render.
  const thumbnailImages = useMemo(() => [...allImages].reverse(), [allImages]);

  // Assignments are seeded per-index (mixed with a per-load session seed) so
  // that growing visibleCanvasCount extends the list rather than regenerating
  // it. Within one page load canvas N always gets the same seed, image, and
  // renderer regardless of scroll; each new page load gets a fresh layout.
  const canvasAssignments = useMemo(() => {
    if (availableImages.length === 0 || rendererPool.length === 0) return [];

    return Array.from({ length: visibleCanvasCount }, (_, index) => {
      const random = createSeededRandom((sessionSeed ^ (index * 0x9e3779b1)) >>> 0);
      const imageIndex = Math.floor(random() * availableImages.length);
      const baseSeed = Math.floor(random() * 0xffffffff);
      const seed = index === 0 && seedOverride !== null ? seedOverride : baseSeed;
      const rendererIndex = Math.floor(random() * rendererPool.length);
      const image = availableImages[imageIndex];
      const renderer = rendererPool[rendererIndex];
      const hash = generateSeedHash(seed);

      return {
        image,
        seed,
        renderer,
        rendererName: renderer.displayName,
        hash,
        filename: buildFilename(image, renderer.displayName, hash, index),
      };
    });
  }, [visibleCanvasCount, availableImages, rendererPool, seedOverride, sessionSeed]);

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
              {thumbnailImages.map((img) => {
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
          <ul className="canvas-grid" aria-label="Generated artwork">
            {canvasAssignments.map(({ image: img, seed, renderer, rendererName, hash, filename }, index) => (
              <li key={`${img.id}-${seed}-${index}`} className="canvas-grid__item">
                <Canvas
                  image={img.element}
                  renderFn={renderer}
                  seed={seed}
                  rendererName={rendererName}
                  hash={hash}
                  filename={filename}
                  mimeType={img.mimeType}
                />
              </li>
            ))}
          </ul>
          <div ref={sentinelRef} style={{ height: "1px" }} />
        </>
      )}
    </>
  );
}

export default App;
