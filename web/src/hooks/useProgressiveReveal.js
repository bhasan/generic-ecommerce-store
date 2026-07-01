import { useEffect, useRef, useState } from 'react';

/**
 * Progressively reveals items by incrementing visibleCount when a sentinel
 * element scrolls into view via IntersectionObserver.
 *
 * @param {Array} items - The full list of items (e.g. topLevel categories)
 * @param {number} step  - How many items to reveal at a time (default 4)
 * @returns {{ visibleCount: number, sentinelRef: Function }}
 */
export function useProgressiveReveal(items, step = 4) {
  const [visibleCount, setVisibleCount] = useState(step);
  const observerRef = useRef(null);

  // Reset when item count or step changes (e.g. filtering/reloading).
  // Using items.length instead of items avoids spurious resets when the caller
  // returns a new array reference on every render with the same contents.
  useEffect(() => {
    setVisibleCount(step);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(items ?? []).length, step]);

  // Callback ref: wired to the sentinel <div>
  const sentinelRef = (node) => {
    // Disconnect any previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((prev) => prev + step);
      }
    });

    observerRef.current.observe(node);
  };

  return { visibleCount, sentinelRef };
}
