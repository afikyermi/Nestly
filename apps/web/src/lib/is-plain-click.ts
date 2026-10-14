import type { MouseEvent } from 'react';

// A primary-button click with no modifier key: the app may follow the link itself. Any other click
// (a new tab, a new window, a download) is left to the browser.
export function isPlainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}
