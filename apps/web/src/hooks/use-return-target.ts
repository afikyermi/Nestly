import { createContext } from 'react';
import type { ReturnTargetStorage } from '@/platform/browser-return-target';

/** App provides the real note and what a fresh load on the Google return found in it; without a provider nothing is kept and nothing found. */
export interface ReturnTarget {
  storage: ReturnTargetStorage;
  /** The profile or post link the note held when this page load began on the Google return, else null. Taken once, at load. */
  landed: string | null;
}

export const ReturnTargetContext = createContext<ReturnTarget>({
  storage: { read: () => null, write: () => undefined, remove: () => undefined },
  landed: null,
});

/** The profile or post link a Guest is being led to sign in for, as the route guard holds it now (router state); null when none. */
export const CurrentReturnContext = createContext<string | null>(null);
