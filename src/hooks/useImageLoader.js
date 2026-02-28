import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Custom hook for loading images
function useImageLoader() {
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const nextImageIdRef = useRef(0);

  // Load default images on mount
  useEffect(() => {
    const imageNames = ["Tree-Peony-Kazumasa-Ogawa.jpg"];
    let cancelled = false;
    const loadedImages = [];
    let loadedCount = 0;

    const handleLoadComplete = () => {
      loadedCount++;
      if (loadedCount === imageNames.length && loadedImages.length > 0 && !cancelled) {
        setAllImages(loadedImages);
        setAvailableImages(loadedImages);
      }
    };

    imageNames.forEach((name) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
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

    return () => {
      cancelled = true;
    };
  }, []);

  const loadFiles = useCallback((files) => {
    const validFiles = files.filter(
      (file) => file.type === "image/png" || file.type === "image/jpeg"
    );

    if (validFiles.length === 0) return;

    const newImages = [];
    let processedCount = 0;

    const handleFileComplete = () => {
      processedCount++;
      if (processedCount === validFiles.length && newImages.length > 0) {
        setAllImages((prev) => [...prev, ...newImages]);
        setAvailableImages((prev) => [...prev, ...newImages]);
      }
    };

    validFiles.forEach((file) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const wrapped = { id: nextImageIdRef.current++, element: img, filename: file.name, mimeType: file.type };
        newImages.push(wrapped);
        handleFileComplete();
      };

      img.onerror = () => {
        console.error(`Failed to load image: ${file.name}`);
        URL.revokeObjectURL(objectUrl);
        handleFileComplete();
      };

      img.src = objectUrl;
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
