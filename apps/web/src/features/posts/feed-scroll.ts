import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { rememberScroll, type FeedScroll } from './feed-memory';

/** How far the reader has scrolled before "חזרה למעלה" appears (c20: a long scroll). */
const LONG_SCROLL_PX = 1500;

/** The element that scrolls: below 1024 the shell's `main`, from 1024 the page itself. */
function scroller(root: HTMLElement | null): HTMLElement | null {
  const main = root?.closest('main') ?? null;
  return main !== null && getComputedStyle(main).overflowY === 'auto' ? main : null;
}

function position(root: HTMLElement | null): FeedScroll {
  return { main: scroller(root)?.scrollTop ?? 0, page: window.scrollY };
}

export interface FeedScrollControl {
  /** True after a long scroll. */
  far: boolean;
  /** Put the scroll back at the top. */
  toTop: () => void;
}

// What the feed needs from scrolling (F3.2b c20): whether the reader is far down, the position kept for Back, and putting a remembered
// position back. The shell's own reset to the top runs after a screen mounts, so the restore waits for the next frame.
export function useFeedScroll(rootRef: RefObject<HTMLElement | null>, restoreTo: FeedScroll | null): FeedScrollControl {
  const [far, setFar] = useState(false);
  const restoring = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    const update = () => {
      if (restoring.current) return;
      const at = position(root);
      rememberScroll(at);
      setFar(Math.max(at.main, at.page) > LONG_SCROLL_PX);
    };
    const container = scroller(root);
    (container ?? window).addEventListener('scroll', update, { passive: true });
    return () => (container ?? window).removeEventListener('scroll', update);
  }, [rootRef]);

  useEffect(() => {
    if (restoreTo === null) return;
    restoring.current = true;
    const frame = requestAnimationFrame(() => {
      const container = scroller(rootRef.current);
      if (container !== null) container.scrollTop = restoreTo.main;
      window.scrollTo(0, restoreTo.page);
      restoring.current = false;
      setFar(Math.max(restoreTo.main, restoreTo.page) > LONG_SCROLL_PX);
    });
    return () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
    };
  }, [rootRef, restoreTo]);

  const toTop = useCallback(() => {
    const container = scroller(rootRef.current);
    if (container !== null) container.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [rootRef]);

  return { far, toTop };
}
