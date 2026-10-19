import type { BackCloses } from '@/hooks/use-back-closes';

/** The in-app address a plain left click on a same-origin link opens, else null (a modified click, another window, not a link). */
function inAppLink(event: MouseEvent, target: EventTarget | null): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = target instanceof Element ? target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || link.target !== '') return null;
  return `${link.pathname}${link.search}${link.hash}`;
}

/**
 * Listens (capture) for a link click while a closed menu's history entry is still being taken back (F3.9 c10): that click is held and
 * opened through followAfterClose once the step back has landed, else the step back would undo it. Returns the stop.
 */
export function holdLinksWhileClosing({ closing, followAfterClose }: Pick<BackCloses, 'closing' | 'followAfterClose'>): () => void {
  const onClick = (event: MouseEvent) => {
    if (!closing()) return;
    const path = inAppLink(event, event.target);
    if (path === null) return;
    event.preventDefault();
    event.stopPropagation();
    followAfterClose(path);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

// A press outside an open "⋯" menu closes it (F3.9 c8; F3.7 reuses it for the post page and comment menus). When the press is an in-app link
// (another card's time link, a navigation item), its click is held and replayed once the menu's history entry is gone, so the link is never
// undone and no dead entry stays under it. Moved here from FeedScreen unchanged when F3.7 needed it on two more screens.
export function outsidePressHandler({ closingByPointer, followAfterClose }: Pick<BackCloses, 'closingByPointer' | 'followAfterClose'>) {
  return (target: EventTarget | null) => {
    closingByPointer();
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || link.target !== '') return;
    const hold = (event: MouseEvent) => {
      document.removeEventListener('click', hold, true);
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Node) || !link.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      followAfterClose(`${link.pathname}${link.search}${link.hash}`);
    };
    document.addEventListener('click', hold, true);
  };
}
