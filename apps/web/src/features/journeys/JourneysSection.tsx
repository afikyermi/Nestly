import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateIso, type OwnJourneys } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { CHILDREN_LIMIT_TEXT } from '@/lib/child-fields';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { addOwnChild, fetchOwnJourneys, saveOwnChild, type JourneysOutcome } from '@/services/api/journeys';
import { JourneysContent, type ChildFormTarget, type JourneysFocus, type JourneysView, type OpenChildForm } from './JourneysContent';
import {
  checkChildForm,
  EMPTY_CHILD_FORM,
  formValuesOf,
  LOAD_FAILED_TEXT,
  SAVE_FAILED_TEXT,
  type ChildFormValues,
} from './journeys-form';

type Loaded = Extract<JourneysView, { kind: 'loaded' }>;

const openerOf = (target: ChildFormTarget): JourneysFocus['target'] =>
  target.mode === 'add' ? { kind: 'add' } : { kind: 'edit', childId: target.childId };

// The "המסע שלי" section's flow (FR-PROFILE-002, PG-012; F2.2a): load the own journeys and children, show them, add a child, edit a
// child. The server and RLS decide whose rows they are; this section sends a child's row id only, never a user id. A refused token
// (401) or a stopped account (403) asks the session for the account state again, and the session guard ends the session with its
// notice (ERR-038, ERR-037). The typed values live in this component's memory only.
export function JourneysSection() {
  const account = useSessionAccount();
  const [view, setView] = useState<JourneysView>({ kind: 'loading' });
  const [focus, setFocus] = useState<JourneysFocus>({ target: { kind: 'add' }, tick: 0 });
  // True from the first refused save until the form closes: the field errors then follow every keystroke.
  const validating = useRef(false);
  const saving = useRef(false);
  const loads = useRef(0);

  const focusOn = (target: JourneysFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // What a refused answer means beyond this section: the session guard is told to look again.
  const refused = useCallback(
    (outcome: JourneysOutcome): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );

  const token = useCallback(
    async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)),
    [account],
  );

  const load = useCallback(
    async (afterRetry: boolean) => {
      const run = (loads.current += 1);
      setView({ kind: 'loading' });
      const accessToken = await token();
      const outcome: JourneysOutcome = accessToken === null ? { kind: 'failed' } : await fetchOwnJourneys(accessToken);
      if (run !== loads.current) return;
      if (outcome.kind === 'journeys') {
        setView({ kind: 'loaded', data: outcome.journeys, saved: false, form: null });
        // "נסו שוב" is gone with the failure: focus goes to the section's action.
        if (afterRetry) focusOn({ kind: 'add' });
        return;
      }
      setView({ kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
      if (afterRetry) focusOn({ kind: 'message' });
    },
    [token, refused],
  );

  useEffect(() => {
    void load(false);
    return () => {
      loads.current += 1;
    };
  }, [load]);

  function open(current: Loaded, target: ChildFormTarget, values: ChildFormValues) {
    validating.current = false;
    setView({ ...current, saved: false, form: { target, values, errors: {}, saving: false, failure: null } });
    focusOn({ kind: 'name' });
  }

  function add(current: Loaded) {
    if (current.form !== null) return;
    open(current, { mode: 'add' }, EMPTY_CHILD_FORM);
  }

  function edit(current: Loaded, childId: string) {
    const child = current.data.children.find((candidate) => candidate.id === childId);
    if (current.form !== null || child === undefined) return;
    open(current, { mode: 'edit', childId }, formValuesOf(child));
  }

  function close(form: OpenChildForm, data: OwnJourneys, saved: boolean) {
    validating.current = false;
    setView({ kind: 'loaded', data, saved, form: null });
    focusOn(openerOf(form.target));
  }

  function change(current: Loaded, form: OpenChildForm, values: ChildFormValues) {
    const checked = validating.current ? checkChildForm(values, localDateIso(new Date())) : null;
    setView({ ...current, form: { ...form, values, errors: checked !== null && !checked.ok ? checked.errors : {} } });
  }

  async function save(current: Loaded, form: OpenChildForm) {
    if (saving.current) return;
    const checked = checkChildForm(form.values, localDateIso(new Date()));
    if (!checked.ok) {
      validating.current = true;
      setView({ ...current, form: { ...form, errors: checked.errors, failure: null } });
      focusOn({ kind: 'invalid' });
      return;
    }
    saving.current = true;
    setView({ ...current, form: { ...form, errors: {}, saving: true, failure: null } });
    try {
      const accessToken = await token();
      const { target } = form;
      const outcome: JourneysOutcome =
        accessToken === null
          ? { kind: 'failed' }
          : target.mode === 'add'
            ? await addOwnChild(accessToken, checked.value)
            : await saveOwnChild(accessToken, target.childId, checked.value);
      if (outcome.kind === 'journeys') {
        close(form, outcome.journeys, true);
        return;
      }
      // The form keeps what is in it now, including anything typed while the save was in flight.
      const failure = outcome.kind === 'too-many' ? CHILDREN_LIMIT_TEXT : (refused(outcome) ?? SAVE_FAILED_TEXT);
      setView((latest) =>
        latest.kind === 'loaded' && latest.form !== null ? { ...latest, form: { ...latest.form, saving: false, failure } } : latest,
      );
      focusOn({ kind: 'message' });
    } finally {
      saving.current = false;
    }
  }

  function cancel(current: Loaded, form: OpenChildForm) {
    if (saving.current) return;
    close(form, current.data, false);
  }

  const loaded = view.kind === 'loaded' ? view : null;
  const form = loaded?.form ?? null;
  return (
    <JourneysContent
      view={view}
      focus={focus}
      onRetry={() => void load(true)}
      {...(loaded !== null ? { onAdd: () => add(loaded), onEdit: (childId: string) => edit(loaded, childId) } : {})}
      {...(loaded !== null && form !== null
        ? {
            onChange: (values: ChildFormValues) => change(loaded, form, values),
            onSave: () => void save(loaded, form),
            onCancel: () => cancel(loaded, form),
          }
        : {})}
    />
  );
}
