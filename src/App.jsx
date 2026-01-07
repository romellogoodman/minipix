import { useEffect, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import { rendererConfig } from "./renderers";
import { createSeededRandom } from "./utils";
import { Upload } from "feather-icons-react";

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
        img.filename = name;
        img.mimeType = "image/jpeg";
        loadedImages.push(img);
        handleLoadComplete();
      };
      img.onerror = () => {
        console.error(`Failed to load default image: ${name}`);
        handleLoadComplete();
      };
      img.src = `/${name}`;
    });
  }, []);

  const loadFiles = (files) => {
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
          img.filename = file.name;
          img.mimeType = file.type;
          console.log("Loaded image:", file.name);
          newImages.push(img);
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
  };

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

  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      if (e.target === document.body) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      onFilesDrop(files);
    };

    document.body.addEventListener("dragover", handleDragOver);
    document.body.addEventListener("dragleave", handleDragLeave);
    document.body.addEventListener("drop", handleDrop);

    return () => {
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

  // Get all enabled renderers from config
  const enabledRenderers = Object.keys(rendererConfig).map(
    (name) => renderers[name]
  );

  // Parse query parameter for hardcoded renderer(s) - supports comma-separated list
  const queryParams = new URLSearchParams(window.location.search);
  const rendererParam = queryParams.get("renderer");
  const filteredRenderers = rendererParam
    ? rendererParam
        .split(",")
        .map((name) => renderers[name.trim()])
        .filter(Boolean)
    : null;

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

  const getRandomImage = () => {
    if (availableImages.length === 0) return null;

    return availableImages[Math.floor(Math.random() * availableImages.length)];
  };

  // Select a single renderer using seeded randomness
  const getRenderer = (seed) => {
    // Use filtered renderers if specified via query param
    const pool =
      filteredRenderers && filteredRenderers.length > 0
        ? filteredRenderers
        : enabledRenderers;

    if (pool.length === 0) {
      return null;
    }

    const random = createSeededRandom(seed);
    const rendererIndex = Math.floor(random() * pool.length);
    return pool[rendererIndex];
  };

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
                .map((img, index) => (
                  <button
                    key={index}
                    className={`nav__thumbnail ${
                      availableImages.includes(img)
                        ? "nav__thumbnail--active"
                        : "nav__thumbnail--inactive"
                    }`}
                    onClick={() => handleToggleImage(img)}
                    aria-label={`${availableImages.includes(img) ? "Disable" : "Enable"} ${img.filename || `image ${index + 1}`}`}
                    aria-pressed={availableImages.includes(img)}
                    type="button"
                    style={{
                      backgroundImage: `url(${img.src})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                ))}
            </div>
          </div>
        </div>
      </nav>

      {availableImages.length > 0 && (
        <>
          <div className="canvas-grid" role="grid" aria-label="Generated artwork grid">
            {Array.from({ length: visibleCanvasCount }).map((_, index) => {
              const img = getRandomImage();
              const seed = Math.floor(Math.random() * 0xffffffff);
              const renderer = getRenderer(seed);

              // Generate short hash from seed (6 characters)
              const hash = generateSeedHash(seed);

              // Callback for when a render fails and needs retry with new renderer
              const handleRetryNeeded = () => {
                const newSeed = Math.floor(Math.random() * 0xffffffff);
                const newRenderer = getRenderer(newSeed);
                return { newRenderFn: newRenderer, newSeed };
              };

              return (
                <div key={`${generation}-${index}`} className="canvas-grid__item" role="gridcell">
                  <Canvas
                    image={img}
                    renderFn={renderer}
                    seed={seed}
                    onRetryNeeded={handleRetryNeeded}
                    onClick={(canvas) => {
                      const link = document.createElement("a");

                      // Use original image format
                      const mimeType = img?.mimeType || "image/png";
                      const quality =
                        mimeType === "image/jpeg" ? 0.95 : undefined;
                      const dataUrl = canvas.toDataURL(mimeType, quality);

                      link.href = dataUrl;

                      // Get file extension from mime type
                      const extension =
                        mimeType === "image/jpeg" ? "jpg" : "png";

                      let filename;
                      if (img?.filename) {
                        // Replace original extension with correct one
                        const nameWithoutExt = img.filename.replace(
                          /\.(jpe?g|png)$/i,
                          ""
                        );
                        filename = `${nameWithoutExt}-minipix-${rendererConfig[renderer.name].displayName}-${hash}.${extension}`;
                      } else {
                        filename = `canvas-${
                          index + 1
                        }-minipix-${rendererConfig[renderer.name].displayName}-${hash}.${extension}`;
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
