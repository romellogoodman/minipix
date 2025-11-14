import { useEffect, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import { Upload } from "feather-icons-react";

function App() {
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [visibleCanvasCount, setVisibleCanvasCount] = useState(12);
  const [isDragging, setIsDragging] = useState(false);

  const rendererFunctions = Object.values(renderers);

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

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    loadFiles(files);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
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

  const getRandomImage = () => {
    if (availableImages.length === 0) return null;

    return availableImages[Math.floor(Math.random() * availableImages.length)];
  };

  const getRandomRenderer = () => {
    return rendererFunctions[
      Math.floor(Math.random() * rendererFunctions.length)
    ];
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && availableImages.length > 0) {
          setVisibleCanvasCount((prev) => prev + 12);
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
  }, [availableImages.length]);

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
      loadFiles(files);
    };

    document.body.addEventListener("dragover", handleDragOver);
    document.body.addEventListener("dragleave", handleDragLeave);
    document.body.addEventListener("drop", handleDrop);

    return () => {
      document.body.removeEventListener("dragover", handleDragOver);
      document.body.removeEventListener("dragleave", handleDragLeave);
      document.body.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <>
      {isDragging && (
        <div className="dropzone-overlay">
          <div className="dropzone-overlay__border">
            <div className="dropzone-overlay__content">Drop images here</div>
          </div>
        </div>
      )}
      <nav className="nav">
        <div className="nav__container">
          <div className="nav__controls">
            <input
              ref={fileInputRef}
              type="file"
              className="nav__input"
              accept="image/png, image/jpeg"
              multiple
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button onClick={handleUploadClick} className="nav__button">
              <Upload size={20} />
            </button>
            {allImages.length > 0 && (
              <div className="nav__thumbnails">
                {allImages.map((img, index) => (
                  <img
                    key={index}
                    src={img.src}
                    alt={`Upload ${index + 1}`}
                    className={`nav__thumbnail ${
                      availableImages.includes(img)
                        ? "nav__thumbnail--active"
                        : "nav__thumbnail--inactive"
                    }`}
                    onClick={() => toggleImageAvailability(img)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {availableImages.length > 0 && (
        <>
          <div className="canvas-grid">
            {Array.from({ length: visibleCanvasCount }).map((_, index) => {
              const img = getRandomImage();
              const renderer = getRandomRenderer();
              return (
                <div key={index} className="canvas-grid__item">
                  <Canvas
                    image={img}
                    renderFn={renderer}
                    onClick={(canvas) => {
                      const link = document.createElement("a");

                      // Use original image format
                      const mimeType = img?.mimeType || "image/png";
                      const quality = mimeType === "image/jpeg" ? 0.95 : undefined;
                      const dataUrl = canvas.toDataURL(mimeType, quality);

                      link.href = dataUrl;

                      // Get file extension from mime type
                      const extension = mimeType === "image/jpeg" ? "jpg" : "png";

                      let filename;
                      if (img?.filename) {
                        // Replace original extension with correct one
                        const nameWithoutExt = img.filename.replace(/\.(jpe?g|png)$/i, "");
                        filename = `minipix-${nameWithoutExt}.${extension}`;
                      } else {
                        filename = `minipix-canvas-${index + 1}.${extension}`;
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
