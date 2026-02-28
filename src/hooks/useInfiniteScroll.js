import { useEffect, useRef, useState } from "react";

// Custom hook for infinite scroll
const pageSize = 20;

function useInfiniteScroll(sentinelRef, enabled) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // The sentinel is conditionally rendered by App, so it may not exist on
  // first mount. Re-run when `enabled` flips (which coincides with the
  // sentinel being added to the DOM) and read `enabled` through a ref so we
  // don't rebuild the observer on every scroll.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && enabledRef.current) {
          setVisibleCount((prev) => prev + pageSize);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const reset = () => {
    setVisibleCount(pageSize);
  };

  return { visibleCount, reset };
}

export default useInfiniteScroll;
