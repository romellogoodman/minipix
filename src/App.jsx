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

    imageNames.forEach((name) => {
      const img = new Image();
      img.onload = () => {
        img.filename = name;
        img.mimeType = "image/jpeg";
        loadedImages.push(img);
        loadedCount++;

        if (loadedCount === imageNames.length) {
          setAllImages(loadedImages);
          setAvailableImages(loadedImages);
        }
      };
      img.src = `/${name}`;
    });
  }, []);

  const loadFiles = (files) => {
    const newImages = [];
    let loadedCount = 0;

    files.forEach((file) => {
      if (file.type === "image/png" || file.type === "image/jpeg") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();

          img.onload = () => {
            img.filename = file.name;
            img.mimeType = file.type;
            console.log("Loaded image:", file.name);
            newImages.push(img);
            loadedCount++;

            if (loadedCount === files.length) {
              console.log(
                "All images loaded:",
                newImages.map((i) => i.filename)
              );
              setAllImages((prev) => [...prev, ...newImages]);
              setAvailableImages((prev) => [...prev, ...newImages]);
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && enabled) {
          setVisibleCount((prev) => prev + pageSize);
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
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

  // Parse query parameter for hardcoded renderer
  const queryParams = new URLSearchParams(window.location.search);
  const rendererName = queryParams.get("renderer");
  const hardcodedRenderer =
    rendererName && renderers[rendererName] ? renderers[rendererName] : null;

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
    // Use hardcoded renderer if specified via query param
    if (hardcodedRenderer) {
      return hardcodedRenderer;
    }

    if (enabledRenderers.length === 0) {
      return null;
    }

    const random = createSeededRandom(seed);
    const rendererIndex = Math.floor(random() * enabledRenderers.length);
    return enabledRenderers[rendererIndex];
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

      <nav className="nav">
        <div className="nav__container">
          <div className="nav__controls">
            <div className="nav__thumbnails">
              <div
                className="nav__thumbnail nav__thumbnail--upload"
                onClick={handleUploadClick}
              >
                <Upload size={16} />
              </div>
              {allImages
                .slice()
                .reverse()
                .map((img, index) => (
                  <img
                    key={index}
                    src={img.src}
                    alt={img.filename || `Upload ${index + 1}`}
                    className={`nav__thumbnail ${
                      availableImages.includes(img)
                        ? "nav__thumbnail--active"
                        : "nav__thumbnail--inactive"
                    }`}
                    onClick={() => handleToggleImage(img)}
                  />
                ))}
            </div>
          </div>
          {/* <div className="nav__caption">
            <h2 className="nav__caption-title">minipix</h2>
            <p className="nav__caption-text">
              A photo manipulation tool.
              <br />
              By{" "}
              <a
                href="https://romellogoodman.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Romello Goodman
              </a>{" "}
              with{" "}
              <a
                href="https://www.getty.edu/art/collection/object/108QM6"
                target="_blank"
                rel="noopener noreferrer"
              >
                Kazumasa Ogawa's
              </a>{" "}
              photos
            </p>
          </div> */}
        </div>
      </nav>

      {availableImages.length > 0 && (
        <>
          <div className="canvas-grid">
            {Array.from({ length: visibleCanvasCount }).map((_, index) => {
              const img = getRandomImage();
              const seed = Math.floor(Math.random() * 0xffffffff);
              const renderer = getRenderer(seed);

              // Generate short hash from seed (6 characters)
              const hash = seed.toString(36).substring(0, 6);

              return (
                <div key={`${generation}-${index}`} className="canvas-grid__item">
                  <Canvas
                    image={img}
                    renderFn={renderer}
                    seed={seed}
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
                        filename = `${nameWithoutExt}-minipix-${renderer.name}-${hash}.${extension}`;
                      } else {
                        filename = `canvas-${
                          index + 1
                        }-minipix-${renderer.name}-${hash}.${extension}`;
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
