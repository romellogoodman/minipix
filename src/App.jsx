import { useRef, useState } from 'react';
import './App.scss';

function App() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');

          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;

          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = e.target.result;
        setImage(img);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <nav className="nav">
        <div className="nav__container">
          <h1 className="nav__title">Gaze</h1>
          <div className="nav__controls">
            <input
              ref={fileInputRef}
              type="file"
              className="nav__input"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUploadClick} className="nav__button">
              Upload Image
            </button>
          </div>
        </div>
      </nav>

      <canvas ref={canvasRef} className="canvas" />
    </>
  );
}

export default App;
