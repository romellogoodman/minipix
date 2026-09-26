import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_IMAGES = ["Tree-Peony-Kazumasa-Ogawa.jpg", "Earth-Infrared-ESA.jpg"];
const DEFAULT_IMAGE_COUNT = DEFAULT_IMAGES.length;

// Custom hook for loading images
function useImageLoader() {
  const [allImages, setAllImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  // Default images take ids 0..n-1; uploads continue after them.
  const nextImageIdRef = useRef(DEFAULT_IMAGE_COUNT);

  // Load default images on mount
  useEffect(() => {
    let cancelled = false;
    // Indexed by position so the list keeps this order whatever loads first.
    const loadedImages = new Array(DEFAULT_IMAGE_COUNT);
    let loadedCount = 0;

    const handleLoadComplete = () => {
      loadedCount++;
      if (loadedCount < DEFAULT_IMAGE_COUNT || cancelled) return;
      const loaded = loadedImages.filter(Boolean);
      // Prepend, so anything uploaded before the defaults finish loading is kept.
      if (loaded.length > 0) {
        setAllImages((prev) => [...loaded, ...prev]);
        setAvailableImages((prev) => [...loaded, ...prev]);
      }
    };

    DEFAULT_IMAGES.forEach((name, index) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        loadedImages[index] = { id: index, element: img, filename: name, mimeType: "image/jpeg" };
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
