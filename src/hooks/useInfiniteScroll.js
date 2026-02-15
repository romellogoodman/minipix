import { useEffect, useState } from "react";

// Custom hook for infinite scroll
const pageSize = 20;

function useInfiniteScroll(sentinelRef, enabled) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && enabled) {
          setVisibleCount((prev) => prev + pageSize);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
  }, [sentinelRef, enabled]);

  const reset = () => {
    setVisibleCount(pageSize);
  };

  return { visibleCount, reset };
}

export default useInfiniteScroll;
