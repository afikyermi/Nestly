import { useEffect, useRef, useState } from 'react';
import type { HomeResponse, StageContext } from '@nestly/shared';
import { fetchHome } from '@/services/api/trackers';
import { useAuthedCall } from './use-authed-call';

/** A home answer is reused for this long (the feed's journey row after a visit to the home, and back): one request, not one per screen. */
const FRESH_MS = 2 * 60_000;

let cached: { at: number; home: HomeResponse } | null = null;

/** Keep a home answer the home screen fetched itself, so the journey row does not ask again. */
export function rememberHome(home: HomeResponse): void {
  cached = { at: Date.now(), home };
}

/**
 * The viewer's active journeys (FR-FEED-001 journey row, AC-209): the home's stage contexts, or null while unknown or when the read failed
 * (the row is then simply absent). `enabled` false asks nothing (a Professional, a staff account, a Group).
 */
export function useJourneyContexts(enabled: boolean): readonly StageContext[] | null {
  const call = useAuthedCall();
  const [contexts, setContexts] = useState<readonly StageContext[] | null>(() =>
    cached !== null && Date.now() - cached.at < FRESH_MS ? cached.home.contexts : null,
  );

  const asked = useRef(false);
  useEffect(() => {
    if (!enabled || asked.current || (cached !== null && Date.now() - cached.at < FRESH_MS)) return;
    asked.current = true;
    // Not cancelled on unmount: a late answer only fills the cache (setting state on an unmounted component is a no-op).
    void (async () => {
      const result = await call(fetchHome);
      if (result.kind !== 'ok') return;
      rememberHome(result.value);
      setContexts(result.value.contexts);
    })();
  }, [call, enabled]);

  return enabled ? contexts : null;
}
