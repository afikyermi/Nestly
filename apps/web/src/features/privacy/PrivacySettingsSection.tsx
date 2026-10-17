import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrivacySettings } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { fetchPrivacySettings, savePrivacySettings, type PrivacyOutcome } from '@/services/api/privacy';
import { PrivacyContent, type PrivacyFocus, type PrivacyView } from './PrivacyContent';
import { LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './privacy-texts';

type Form = Extract<PrivacyView, { kind: 'form' }>;

// The privacy settings' flow (FR-PRIV-001, BR-037; F2.3a): load the own settings, change them, save the three with one Save (Q2).
// The server and RLS decide whose row it is; this section sends no id. A refused token (401) or a stopped account (403) asks the
// session for the account state again, and the session guard ends the session with its notice (ERR-038, ERR-037).
export function PrivacySettingsSection() {
  const account = useSessionAccount();
  const [view, setView] = useState<PrivacyView>({ kind: 'loading' });
  const [focus, setFocus] = useState<PrivacyFocus>({ target: 'start', tick: 0 });
  // Set synchronously on Save, so a second press before the next render sends nothing (c4).
  const saving = useRef(false);
  const loads = useRef(0);

  const focusOn = (target: PrivacyFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // What a refused answer means beyond this section: the session guard is told to look again.
  const refused = useCallback(
    (outcome: PrivacyOutcome): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );

  const load = useCallback(
    async (afterRetry: boolean) => {
      const run = (loads.current += 1);
      setView({ kind: 'loading' });
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome: PrivacyOutcome = token === null ? { kind: 'failed' } : await fetchPrivacySettings(token);
      if (run !== loads.current) return;
      if (outcome.kind === 'settings') {
        setView({ kind: 'form', values: outcome.settings, saving: false, failure: null, saved: false });
        // "נסו שוב" is gone with the failure: focus goes to the first control.
        if (afterRetry) focusOn('start');
        return;
      }
      setView({ kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
      if (afterRetry) focusOn('message');
    },
    [account, refused],
  );

  useEffect(() => {
    void load(false);
    return () => {
      loads.current += 1;
    };
  }, [load]);

  function change(current: Form, values: PrivacySettings) {
    if (saving.current) return;
    setView({ ...current, values, saved: false });
  }

  async function save(current: Form) {
    if (saving.current) return;
    saving.current = true;
    setView({ ...current, saving: true, failure: null, saved: false });
    try {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome: PrivacyOutcome = token === null ? { kind: 'failed' } : await savePrivacySettings(token, current.values);
      if (outcome.kind === 'settings') {
        setView({ kind: 'form', values: outcome.settings, saving: false, failure: null, saved: true });
        return;
      }
      // The choices stay as they were sent (c4); the controls were locked while the save was in flight.
      const failure = refused(outcome) ?? SAVE_FAILED_TEXT;
      setView((latest) => (latest.kind === 'form' ? { ...latest, saving: false, failure } : latest));
      focusOn('message');
    } finally {
      saving.current = false;
    }
  }

  return (
    <PrivacyContent
      view={view}
      focus={focus}
      onRetry={() => void load(true)}
      {...(view.kind === 'form' ? { onChange: (values) => change(view, values), onSave: () => void save(view) } : {})}
    />
  );
}
