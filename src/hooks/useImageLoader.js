import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Custom hook for loading images
function useImageLoader() {
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const nextImageIdRef = useRef(0);

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
        const wrapped = { id: nextImageIdRef.current++, element: img, filename: name, mimeType: "image/jpeg" };
        loadedImages.push(wrapped);
        handleLoadComplete();
      };
      img.onerror = () => {
        console.error(`Failed to load default image: ${name}`);
        handleLoadComplete();
      };
      img.src = `/${name}`;
    });
  }, []);

  const loadFiles = useCallback((files) => {
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
          const wrapped = { id: nextImageIdRef.current++, element: img, filename: file.name, mimeType: file.type };
          console.log("Loaded image:", file.name);
          newImages.push(wrapped);
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
  }, []);

  const availableImageIds = useMemo(() => new Set(availableImages.map((i) => i.id)), [availableImages]);

  const toggleImageAvailability = (img) => {
    setAvailableImages((prev) => {
      const isAvailable = prev.some((i) => i.id === img.id);
      if (isAvailable) {
        return prev.filter((i) => i.id !== img.id);
      } else {
        return [...prev, img];
      }
    });
  };

  return { allImages, availableImages, availableImageIds, loadFiles, toggleImageAvailability };
}

export default useImageLoader;
