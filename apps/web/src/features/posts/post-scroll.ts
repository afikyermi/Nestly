import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** How long a restore keeps trying while the page grows (the post, then its comments, render after the entry is back). */
const RESTORE_MS = 5000;
/** The scroll of the post page per history entry, in memory only, with the furthest it could scroll when it was kept. */
const kept = new Map<string, { at: number; max: number }>();

/** The element that scrolls: below 1024 the shell's `main`, from 1024 the page itself (as the feed's). */
function scroller(): { read: () => number; write: (to: number) => void; max: () => number; target: HTMLElement | Window } {
  const main = document.querySelector('main');
  if (main !== null && getComputedStyle(main).overflowY === 'auto') {
    return { read: () => main.scrollTop, write: (to) => {
      main.scrollTop = to;
    }, max: () => main.scrollHeight - main.clientHeight, target: main };
  }
  const page = document.documentElement;
  return { read: () => window.scrollY, write: (to) => window.scrollTo(0, to), max: () => page.scrollHeight - page.clientHeight, target: window };
}

// Back to a post page from another screen (ux-polish-a c11): the page is re-read and its comments render after the entry is back, so the
// browser's own restore finds a document too short and clamps to the top. This keeps the scroll of the active scroller per history entry and
// puts it back, each frame (after the shell's own reset), until the position is reached, the reader scrolls or touches the page, or
// RESTORE_MS passes. A position the browser only clamped (the document got shorter: leaving, or still loading) is never kept over the real one.
export function usePostScroll(): void {
  const { key } = useLocation();
  useEffect(() => {
    const view = scroller();
    const before = kept.get(key);
    const target = before?.at ?? 0;
    let restoring = target > 0;
    let frame = 0;
    const stop = () => {
      restoring = false;
      cancelAnimationFrame(frame);
    };
    const started = performance.now();
    const step = () => {
      view.write(target);
      if (Math.abs(view.read() - target) <= 1 || performance.now() - started > RESTORE_MS) {
        restoring = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    if (restoring) frame = requestAnimationFrame(step);
    const onScroll = () => {
      if (restoring) return;
      const max = view.max();
      const old = kept.get(key);
      if (old !== undefined && max < old.max) return;
      kept.set(key, { at: view.read(), max });
    };
    view.target.addEventListener('scroll', onScroll, { passive: true });
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(type, stop, { passive: true });
    return () => {
      stop();
      view.target.removeEventListener('scroll', onScroll);
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(type, stop);
    };
  }, [key]);
}
