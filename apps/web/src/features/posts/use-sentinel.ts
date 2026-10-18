import { useEffect, useRef, type RefObject } from 'react';

/** How early the next page is asked for, before the last card scrolls into view. */
const LOOK_AHEAD = '0px 0px 400px 0px';

// Calls `onReach` whenever the hidden element after the last card is near the viewport (F3.2b c18), and once more each time the
// watch is renewed while it still is (a short page leaves the end in view). Idle while `active` is false (loading, last page, error).
export function useSentinel(active: boolean, onReach: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!active || node === null || typeof IntersectionObserver === 'undefined') return;
    const main = node.closest('main');
    const root = main !== null && getComputedStyle(main).overflowY === 'auto' ? main : null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { root, rootMargin: LOOK_AHEAD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, onReach]);
  return ref;
}
