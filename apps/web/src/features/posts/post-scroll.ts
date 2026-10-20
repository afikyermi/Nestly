import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** How long a restore keeps trying while the page grows (the post, then its comments, render after the entry is back). */
const RESTORE_MS = 5000;
/** Window scroll of the post page per history entry, in memory only. */
const kept = new Map<string, number>();

// Back to a post page from another screen (ux-polish-a c11): the page is re-read and its comments render after the entry is back, so the
// browser's own restore finds a document too short and clamps to the top. This keeps the window scroll per history entry and puts it back,
// trying again each frame until the position is reached, the reader scrolls or touches the page, or RESTORE_MS passes.
export function usePostScroll(): void {
  const { key } = useLocation();
  useEffect(() => {
    const target = kept.get(key) ?? 0;
    let restoring = target > 0;
    let frame = 0;
    const stop = () => {
      restoring = false;
      cancelAnimationFrame(frame);
    };
    const started = performance.now();
    const step = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) <= 1 || performance.now() - started > RESTORE_MS) {
        restoring = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    if (restoring) frame = requestAnimationFrame(step);
    const onScroll = () => {
      if (!restoring) kept.set(key, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(type, stop, { passive: true });
    return () => {
      stop();
      window.removeEventListener('scroll', onScroll);
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(type, stop);
    };
  }, [key]);
}
