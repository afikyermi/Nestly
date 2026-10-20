import { useEffect, useRef, type RefObject } from 'react';

/** "Near": within one viewport height above or below the visible area (ux-polish-a, decided in spec.md). */
const NEAR = '100% 0px 100% 0px';

// Calls `onNear` with a card's unit id when a feed card that has a comment area (`[data-card-comments]`) comes near the visible area
// (ux-polish-a c1). Watches the cards inside `rootRef` again whenever `cards` (their ids, in order) changes; the caller asks once per card.
export function useNearCards(rootRef: RefObject<HTMLElement | null>, cards: string, onNear: (unitId: string) => void): void {
  const reach = useRef(onNear);
  reach.current = onNear;
  useEffect(() => {
    const container = rootRef.current;
    if (container === null || cards === '' || typeof IntersectionObserver === 'undefined') return;
    const main = container.closest('main');
    const root = main !== null && getComputedStyle(main).overflowY === 'auto' ? main : null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const unitId = entry.target instanceof HTMLElement ? entry.target.dataset.unitId : undefined;
          if (entry.isIntersecting && unitId !== undefined && entry.target.querySelector('[data-card-comments]') !== null) reach.current(unitId);
        }
      },
      { root, rootMargin: NEAR },
    );
    for (const card of container.querySelectorAll('article[data-unit-id]')) observer.observe(card);
    return () => observer.disconnect();
  }, [rootRef, cards]);
}
