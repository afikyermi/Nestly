import { createContext, useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { GOOGLE_FAILED_TEXT } from '@/lib/auth-texts';
import { forgetReturnTarget, rememberReturnTarget } from '@/services/auth/return-target';
import type { GoogleSignIn } from '@/services/auth/google-sign-in';
import { CurrentReturnContext, ReturnTargetContext } from './use-return-target';

// App provides the real starter. Without a provider the default is one that cannot start: the button then shows the failure text and
// nothing navigates (a story, a test with no Google wiring).
export const GoogleSignInContext = createContext<GoogleSignIn>({ start: () => Promise.resolve('failed') });

export interface GoogleButtonState {
  busy: boolean;
  /** The inline failure, or null. */
  message: string | null;
  onPress: () => void;
  /** Focus returns here after a failure: the disabled button had lost it. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}

// The state of one "המשך עם Google" button (F1.8 criteria 16-17). Pressed, it is busy until the browser leaves; a second press while
// busy does nothing (the guard is a ref, so a press before the next render is also caught).
export function useGoogleSignIn(): GoogleButtonState {
  const google = useContext(GoogleSignInContext);
  const returnTarget = useContext(CurrentReturnContext);
  const { storage } = useContext(ReturnTargetContext);
  const running = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onPress = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    // F2.4c2 c27, F3.6 c8: a Guest who came for a profile or post link keeps it across the round trip to Google.
    // Every start replaces the note: a stale one never outlives a start without a link.
    if (returnTarget !== null) rememberReturnTarget(storage, returnTarget, Date.now());
    else forgetReturnTarget(storage);
    google.start().then(
      (outcome) => {
        if (outcome === 'left') return;
        forgetReturnTarget(storage);
        running.current = false;
        setBusy(false);
        setFailed(true);
      },
      () => {
        forgetReturnTarget(storage);
        running.current = false;
        setBusy(false);
        setFailed(true);
      },
    );
  }, [google, returnTarget, storage]);

  useEffect(() => {
    if (failed) buttonRef.current?.focus();
  }, [failed]);

  // A page restored from the back/forward cache keeps its state, so a button left busy by the trip to Google would stay busy.
  useEffect(
    () =>
      google.onRestoredFromCache?.(() => {
        running.current = false;
        setBusy(false);
      }),
    [google],
  );

  return { busy, message: failed ? GOOGLE_FAILED_TEXT : null, onPress, buttonRef };
}
