import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

// After every in-app navigation or redirect, focus moves to the new screen's `main` (WCAG 2.4.3), so a
// keyboard or screen-reader user starts at the content, not on a control of the screen they left. The
// first load keeps the browser's own focus.
export function FocusOnNavigation() {
  const { key } = useLocation();
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    document.querySelector<HTMLElement>('main')?.focus();
  }, [key]);
  return null;
}
