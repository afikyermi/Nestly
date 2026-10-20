import { createContext, useContext } from 'react';
import type { BrowserEvents } from '@/platform/browser-events';

/** Whether the tab is visible, and a call when it becomes visible again (the browser's adapter is wired in app/App.tsx). */
export type TabVisibility = Pick<BrowserEvents, 'isTabVisible' | 'onTabVisible'>;

// Polling work (the notifications bell) pauses while the tab is hidden and refreshes when it is shown again. Null (tests, stories): the tab
// counts as always visible.
export const TabVisibilityContext = createContext<TabVisibility | null>(null);

export function useTabVisibility(): TabVisibility | null {
  return useContext(TabVisibilityContext);
}
