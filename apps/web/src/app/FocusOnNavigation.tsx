import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { isOverlayState } from '@/lib/history-overlay';

// After every in-app navigation or redirect, focus moves to the new screen's `main` (WCAG 2.4.3), so a
// keyboard or screen-reader user starts at the content, not on a control of the screen they left. The
// first load keeps the browser's own focus. An overlay's own history entry (a card's menu or confirmation, F3.9) is not a new screen:
// adding or removing it on the same address leaves focus to the overlay, which returns it to its button.
export function FocusOnNavigation() {
  const location = useLocation();
  const { key, pathname } = location;
  const state: unknown = location.state;
  const previous = useRef({ key, pathname, overlay: isOverlayState(state) });
  useEffect(() => {
    const before = previous.current;
    if (before.key === key) return;
    const overlay = isOverlayState(state);
    previous.current = { key, pathname, overlay };
    if ((overlay || before.overlay) && before.pathname === pathname) return;
    document.querySelector<HTMLElement>('main')?.focus();
  }, [key, pathname, state]);
  return null;
}
