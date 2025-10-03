import { useRef, useEffect } from "react";

function Canvas({ renderFn, onClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && renderFn) {
      renderFn(canvasRef.current);
    }
  }, [renderFn]);

  const handleClick = () => {
    if (onClick && canvasRef.current) {
      onClick(canvasRef.current);
    }
  };

  return <canvas ref={canvasRef} className="canvas" onClick={handleClick} />;
}

export default Canvas;
