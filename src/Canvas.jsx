import { useRef, useEffect } from "react";

function Canvas({ image, renderFn, onClick, seed }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && renderFn) {
      renderFn({ canvas: canvasRef.current, image, seed });
    }
  }, [renderFn, image, seed]);

  const handleClick = () => {
    if (onClick && canvasRef.current) {
      onClick(canvasRef.current);
    }
  };

  return <canvas ref={canvasRef} className="canvas" onClick={handleClick} />;
}

export default Canvas;
