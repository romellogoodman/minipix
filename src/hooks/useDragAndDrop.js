import { useEffect, useRef, useState } from "react";

// Custom hook for drag and drop
function useDragAndDrop(onFilesDrop) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const hasFiles = (e) => e.dataTransfer?.types?.includes("Files");

    const handleDragEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current++;
      setIsDragging(true);
    };

    const handleDragOver = (e) => {
      if (!hasFiles(e)) return;
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
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFilesDrop(files);
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

export default useDragAndDrop;
