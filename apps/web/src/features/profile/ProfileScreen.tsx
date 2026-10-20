import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwnProfile } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { fetchOwnProfile, saveOwnProfile, type ProfileOutcome } from '@/services/api/profile';
import { ProfileContent, type ProfileFocus, type ProfileView } from './ProfileContent';
import { ProfilePhotoSection } from './ProfilePhotoSection';
import { checkProfileForm, formValuesOf, LOAD_FAILED_TEXT, SAVE_FAILED_TEXT, type ProfileFormValues } from './profile-form';

type Edit = Extract<ProfileView, { kind: 'edit' }>;

// The profile screen's flow (FR-PROFILE-001, AC-015, UC-10; F2.1): load the own profile, show it, edit it, save it. The server and
// RLS decide whose row it is; this screen sends no id. A refused token (401) or a stopped account (403) asks the session for the
// account state again, and the session guard ends the session with its notice (ERR-038, ERR-037). The typed values live in this
// component's memory only.
export function ProfileScreen() {
  const account = useSessionAccount();
  const [view, setView] = useState<ProfileView>({ kind: 'loading' });
  const [focus, setFocus] = useState<ProfileFocus>({ target: 'edit', tick: 0 });
  // The stored profile the form returns to on "ביטול".
  const stored = useRef<OwnProfile | null>(null);
  // True from the first refused save until the form closes: the field errors then follow every keystroke.
  const validating = useRef(false);
  const saving = useRef(false);
  const loads = useRef(0);

  const focusOn = (target: ProfileFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // What a refused answer means beyond this screen: the session guard is told to look again.
  const refused = useCallback(
    (outcome: ProfileOutcome): string | null => {
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
      const outcome: ProfileOutcome = token === null ? { kind: 'failed' } : await fetchOwnProfile(token);
      if (run !== loads.current) return;
      if (outcome.kind === 'profile') {
        stored.current = outcome.profile;
        setView({ kind: 'view', profile: outcome.profile, saved: false });
        // "נסו שוב" is gone with the failure: focus goes to the screen's action, as after a save or a cancel.
        if (afterRetry) focusOn('edit');
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

  function edit() {
    if (stored.current === null) return;
    validating.current = false;
    setView({ kind: 'edit', values: formValuesOf(stored.current), errors: {}, saving: false, failure: null });
    focusOn('name');
  }

  function cancel() {
    if (stored.current === null || saving.current) return;
    validating.current = false;
    setView({ kind: 'view', profile: stored.current, saved: false });
    focusOn('edit');
  }

  function change(current: Edit, values: ProfileFormValues) {
    const checked = validating.current ? checkProfileForm(values) : null;
    setView({ ...current, values, errors: checked !== null && !checked.ok ? checked.errors : {} });
  }

  async function save(current: Edit) {
    if (saving.current) return;
    const checked = checkProfileForm(current.values);
    if (!checked.ok) {
      validating.current = true;
      setView({ ...current, errors: checked.errors, failure: null });
      focusOn('invalid');
      return;
    }
    saving.current = true;
    setView({ ...current, errors: {}, saving: true, failure: null });
    try {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome: ProfileOutcome = token === null ? { kind: 'failed' } : await saveOwnProfile(token, checked.value);
      if (outcome.kind === 'profile') {
        stored.current = outcome.profile;
        validating.current = false;
        setView({ kind: 'view', profile: outcome.profile, saved: true });
        focusOn('edit');
        return;
      }
      // The form keeps what is in it now, including anything typed while the save was in flight.
      const failure = refused(outcome) ?? SAVE_FAILED_TEXT;
      setView((latest) => (latest.kind === 'edit' ? { ...latest, saving: false, failure } : latest));
      focusOn('message');
    } finally {
      saving.current = false;
    }
  }

  return (
    <>
      <ProfileContent
        view={view}
        focus={focus}
        onRetry={() => void load(true)}
        onEdit={edit}
        onCancel={cancel}
        {...(view.kind === 'edit' ? { onChange: (values) => change(view, values), onSave: () => void save(view) } : {})}
      />
      {/* I5 (FR-PROFILE-001): the profile photo, once the profile itself is shown */}
      {view.kind === 'view' || view.kind === 'edit' ? <ProfilePhotoSection /> : null}
    </>
  );
}
