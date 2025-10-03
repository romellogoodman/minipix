import { useRef, useEffect } from "react";

function Canvas({ renderFn }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && renderFn) {
      renderFn(canvasRef.current);
    }
  }, [renderFn]);

  return <canvas ref={canvasRef} className="canvas" />;
}

export default Canvas;
