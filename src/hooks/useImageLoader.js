import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_IMAGES = ["Tree-Peony-Kazumasa-Ogawa.jpg", "Earth-Infrared-ESA.jpg"];

// Resolves to an image record, or null if the image fails to load.
const loadImage = (id, src, filename, mimeType) =>
  new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve({ id, element, filename, mimeType });
    element.onerror = () => {
      console.error(`Failed to load image: ${filename}`);
      resolve(null);
    };
    element.src = src;
  });

// The example images plus anything the user uploads, in a stable order.
function useImageLoader() {
  const [images, setImages] = useState([]);
  // Examples take ids 0..n-1; uploads continue after them.
  const nextId = useRef(DEFAULT_IMAGES.length);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DEFAULT_IMAGES.map((name, id) => loadImage(id, `/${name}`, name, "image/jpeg"))
    ).then((loaded) => {
      // Prepend, so anything uploaded before the examples finish loading is kept.
      if (!cancelled) setImages((prev) => [...loaded.filter(Boolean), ...prev]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFiles = useCallback((files) => {
    const valid = files.filter((file) => file.type === "image/png" || file.type === "image/jpeg");
    if (valid.length === 0) return;
    Promise.all(
      valid.map((file) => {
        const url = URL.createObjectURL(file);
        return loadImage(nextId.current++, url, file.name, file.type).then((image) => {
          if (!image) URL.revokeObjectURL(url);
          return image;
        });
      })
    ).then((loaded) => setImages((prev) => [...prev, ...loaded.filter(Boolean)]));
  }, []);

  return { images, loadFiles };
}

export default useImageLoader;
