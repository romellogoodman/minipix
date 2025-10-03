import { useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";

function App() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const renderImage = (canvas) => {
    if (!image) return;

    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    const scale = Math.min(
      canvas.width / image.width,
      canvas.height / image.height
    );
    const x = (canvas.width - image.width * scale) / 2;
    const y = (canvas.height - image.height * scale) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
  };

  return (
    <>
      <nav className="nav">
        <div className="nav__container">
          <h1 className="nav__title">minicut</h1>
          <div className="nav__controls">
            <input
              ref={fileInputRef}
              type="file"
              className="nav__input"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button onClick={handleUploadClick} className="nav__button">
              Upload Image
            </button>
          </div>
        </div>
      </nav>

      <div className="canvas-grid">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="canvas-grid__item">
            <Canvas renderFn={renderImage} />
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
