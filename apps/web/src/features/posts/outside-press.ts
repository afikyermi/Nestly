import type { BackCloses } from '@/hooks/use-back-closes';

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
