import { useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import { renderImage } from "./renderers";
import { Upload } from "feather-icons-react";

function App() {
  const fileInputRef = useRef(null);
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    const newImages = [];
    let loadedCount = 0;

    files.forEach((file) => {
      if (file.type === "image/png" || file.type === "image/jpeg") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();

          img.onload = () => {
            img.filename = file.name;
            console.log("Loaded image:", file.name);
            newImages.push(img);
            loadedCount++;

            if (loadedCount === files.length) {
              console.log("All images loaded:", newImages.map(i => i.filename));
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

  return (
    <>
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
        <div className="canvas-grid">
          {Array.from({ length: 12 }).map((_, index) => {
            const img = getRandomImage();
            return (
              <div key={index} className="canvas-grid__item">
                <Canvas
                  renderFn={renderImage(img)}
                  onClick={(canvas) => {
                    const link = document.createElement("a");
                    const dataUrl = canvas.toDataURL("image/png");
                    link.href = dataUrl;
                    const filename = img?.filename
                      ? `minicut-${img.filename}`
                      : `minicut-canvas-${index + 1}.png`;
                    link.download = filename;
                    link.click();
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default App;
