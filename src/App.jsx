import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import { rendererConfig } from "./renderers";
import { createSeededRandom } from "./utils";
import { Upload } from "feather-icons-react";

let nextImageId = 0;

// Custom hook for loading images
function useImageLoader() {
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);

  // Load default images on mount
  useEffect(() => {
    const imageNames = ["Tree-Peony-Kazumasa-Ogawa.jpg"];
    const loadedImages = [];
    let loadedCount = 0;
    const totalImages = imageNames.length;

    const handleLoadComplete = () => {
      loadedCount++;
      if (loadedCount === totalImages && loadedImages.length > 0) {
        setAllImages(loadedImages);
        setAvailableImages(loadedImages);
      }
    };

    imageNames.forEach((name) => {
      const img = new Image();
      img.onload = () => {
        const wrapped = { id: nextImageId++, element: img, filename: name, mimeType: "image/jpeg" };
        loadedImages.push(wrapped);
        handleLoadComplete();
      };
      img.onerror = () => {
        console.error(`Failed to load default image: ${name}`);
        handleLoadComplete();
      };
      img.src = `/${name}`;
    });
  }, []);

  const loadFiles = useCallback((files) => {
    const validFiles = files.filter(
      (file) => file.type === "image/png" || file.type === "image/jpeg"
    );

    if (validFiles.length === 0) return;

    const newImages = [];
    let processedCount = 0;
    const totalFiles = validFiles.length;

    const handleFileComplete = () => {
      processedCount++;
      if (processedCount === totalFiles && newImages.length > 0) {
        console.log(
          "All images loaded:",
          newImages.map((i) => i.filename)
        );
        setAllImages((prev) => [...prev, ...newImages]);
        setAvailableImages((prev) => [...prev, ...newImages]);
      }
    };

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          const wrapped = { id: nextImageId++, element: img, filename: file.name, mimeType: file.type };
          console.log("Loaded image:", file.name);
          newImages.push(wrapped);
          handleFileComplete();
        };

        img.onerror = () => {
          console.error(`Failed to load image: ${file.name}`);
          handleFileComplete();
        };

        img.src = e.target.result;
      };

      reader.onerror = () => {
        console.error(`Failed to read file: ${file.name}`);
        handleFileComplete();
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const toggleImageAvailability = (img) => {
    setAvailableImages((prev) => {
      const isAvailable = prev.includes(img);
      if (isAvailable) {
        return prev.filter((i) => i !== img);
      } else {
        return [...prev, img];
      }
    });
  };

  return { allImages, availableImages, loadFiles, toggleImageAvailability };
}

// Generate a consistent 6-character hash from seed (fixes collision issues)
function generateSeedHash(seed) {
  return Math.abs(seed).toString(36).padStart(7, "0").substring(0, 6);
}

// Custom hook for drag and drop
function useDragAndDrop(onFilesDrop) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e) => {
      e.preventDefault();
      dragCounter.current++;
      setIsDragging(true);
    };

    const handleDragOver = (e) => {
      e.preventDefault();
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      onFilesDrop(files);
    };

    document.body.addEventListener("dragenter", handleDragEnter);
    document.body.addEventListener("dragover", handleDragOver);
    document.body.addEventListener("dragleave", handleDragLeave);
    document.body.addEventListener("drop", handleDrop);

    return () => {
      document.body.removeEventListener("dragenter", handleDragEnter);
      document.body.removeEventListener("dragover", handleDragOver);
      document.body.removeEventListener("dragleave", handleDragLeave);
      document.body.removeEventListener("drop", handleDrop);
    };
  }, [onFilesDrop]);

  return { isDragging };
}

// Custom hook for infinite scroll
const pageSize = 20;

function useInfiniteScroll(sentinelRef, enabled) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && enabled) {
          setVisibleCount((prev) => prev + pageSize);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
  }, [sentinelRef, enabled]);

  const reset = () => {
    setVisibleCount(pageSize);
  };

  return { visibleCount, reset };
}

function App() {
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);
  const [generation, setGeneration] = useState(0);

  const { allImages, availableImages, loadFiles, toggleImageAvailability } =
    useImageLoader();
  const { isDragging } = useDragAndDrop(loadFiles);
  const { visibleCount: visibleCanvasCount, reset: resetScroll } =
    useInfiniteScroll(sentinelRef, availableImages.length > 0);

  // Force regeneration when available images change
  useEffect(() => {
    setGeneration((prev) => prev + 1);
  }, [availableImages]);

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

  // Pre-compute canvas assignments using seeded randomness (deterministic per generation)
  const rendererPool = filteredRenderers || enabledRenderers;

  const canvasAssignments = useMemo(() => {
    if (availableImages.length === 0 || rendererPool.length === 0) return [];

    // Use generation as seed for deterministic assignments
    const random = createSeededRandom(generation * 0x1337);
    return Array.from({ length: visibleCanvasCount }, () => {
      const imageIndex = Math.floor(random() * availableImages.length);
      const seed = Math.floor(random() * 0xffffffff);
      const rendererRandom = createSeededRandom(seed);
      const rendererIndex = Math.floor(rendererRandom() * rendererPool.length);
      return {
        image: availableImages[imageIndex],
        seed,
        renderer: rendererPool[rendererIndex],
      };
    });
  }, [generation, visibleCanvasCount, availableImages, rendererPool]);

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
                .map((img) => (
                  <button
                    key={img.id}
                    className={`nav__thumbnail ${
                      availableImages.includes(img)
                        ? "nav__thumbnail--active"
                        : "nav__thumbnail--inactive"
                    }`}
                    onClick={() => handleToggleImage(img)}
                    aria-label={`${availableImages.includes(img) ? "Disable" : "Enable"} ${img.filename || "image"}`}
                    aria-pressed={availableImages.includes(img)}
                    type="button"
                    style={{
                      backgroundImage: `url(${img.element.src})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                ))}
            </div>
          </div>
        </div>
      </nav>

      {canvasAssignments.length > 0 && (
        <>
          <div className="canvas-grid" role="grid" aria-label="Generated artwork grid">
            {canvasAssignments.map(({ image: img, seed, renderer }, index) => {
              const hash = generateSeedHash(seed);

              const handleRetryNeeded = () => {
                const retrySeed = seed ^ (0xdeadbeef + index);
                const retryRandom = createSeededRandom(retrySeed);
                const retryRendererIndex = Math.floor(retryRandom() * rendererPool.length);
                return { newRenderFn: rendererPool[retryRendererIndex], newSeed: retrySeed };
              };

              return (
                <div key={`${generation}-${index}`} className="canvas-grid__item" role="gridcell">
                  <Canvas
                    image={img.element}
                    renderFn={renderer}
                    seed={seed}
                    onRetryNeeded={handleRetryNeeded}
                    onClick={(canvas) => {
                      const link = document.createElement("a");

                      const mimeType = img.mimeType || "image/png";
                      const quality =
                        mimeType === "image/jpeg" ? 0.95 : undefined;
                      const dataUrl = canvas.toDataURL(mimeType, quality);

                      link.href = dataUrl;

                      const extension =
                        mimeType === "image/jpeg" ? "jpg" : "png";

                      let filename;
                      if (img.filename) {
                        const nameWithoutExt = img.filename.replace(
                          /\.(jpe?g|png)$/i,
                          ""
                        );
                        filename = `${nameWithoutExt}-minipix-${renderer.displayName}-${hash}.${extension}`;
                      } else {
                        filename = `canvas-${
                          index + 1
                        }-minipix-${renderer.displayName}-${hash}.${extension}`;
                      }

                      link.download = filename;
                      link.click();
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
