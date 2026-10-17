import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateIso, type DateParts, type OwnJourneys } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { CHILDREN_LIMIT_TEXT } from '@/lib/child-fields';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import {
  addOwnChild,
  addOwnPregnancy,
  fetchOwnJourneys,
  saveOwnChild,
  saveOwnDueDate,
  type JourneysOutcome,
} from '@/services/api/journeys';
import { JourneysContent, type JourneysFocus, type JourneysView, type OpenChildForm, type OpenForm, type OpenPregnancyForm } from './JourneysContent';
import {
  canAddPregnancy,
  checkChildForm,
  checkDueDateForm,
  dueDateValuesOf,
  EMPTY_CHILD_FORM,
  EMPTY_DUE_DATE,
  formValuesOf,
  LOAD_FAILED_TEXT,
  SAVE_FAILED_TEXT,
  type ChildFormValues,
} from './journeys-form';

type Loaded = Extract<JourneysView, { kind: 'loaded' }>;

type FormCheck =
  | { ok: true; saving: OpenForm; send: (accessToken: string) => Promise<JourneysOutcome> }
  | { ok: false; form: OpenForm };

/** The open form's check before anything is sent, against `today`: the form with its errors, or the form in flight and its request. */
function checkForm(form: OpenForm, today: string): FormCheck {
  if (form.kind === 'child') {
    const checked = checkChildForm(form.values, today);
    if (!checked.ok) return { ok: false, form: { ...form, errors: checked.errors, failure: null } };
    const { target } = form;
    return {
      ok: true,
      saving: { ...form, errors: {}, saving: true, failure: null },
      send: (accessToken) =>
        target.mode === 'add' ? addOwnChild(accessToken, checked.value) : saveOwnChild(accessToken, target.childId, checked.value),
    };
  }
  const checked = checkDueDateForm(form.values, today);
  if (!checked.ok) return { ok: false, form: { ...form, error: checked.error, failure: null } };
  const { target } = form;
  return {
    ok: true,
    saving: { ...form, error: null, saving: true, failure: null },
    send: (accessToken) =>
      target.mode === 'add' ? addOwnPregnancy(accessToken, checked.value) : saveOwnDueDate(accessToken, target.journeyId, checked.value),
  };
}

/**
 * The button that opened `form`, to take focus back when it closes. After a pregnancy add (or a refused one, refreshed), the
 * pregnancy's "עריכה".
 */
function openerOf(form: OpenForm, data: OwnJourneys): JourneysFocus['target'] {
  if (form.kind === 'child') return form.target.mode === 'add' ? { kind: 'add' } : { kind: 'edit', childId: form.target.childId };
  if (form.target.mode === 'edit') return { kind: 'edit-journey', journeyId: form.target.journeyId };
  const added = data.journeys.find((journey) => journey.stage === 'pregnant');
  if (added !== undefined) return { kind: 'edit-journey', journeyId: added.id };
  // No pregnancy to land on: "הוספת הריון" while it is still offered, else "הוספת ילד", which every view has.
  return canAddPregnancy(data) ? { kind: 'add-pregnancy' } : { kind: 'add' };
}

// The "המסע שלי" section's flow (FR-PROFILE-002, PG-012; F2.2a, F2.2b1): load the own journeys and children, show them, add or edit
// a child, add a pregnancy or edit its due date. The server and RLS decide whose rows they are; this section sends a row id only,
// never a user id. A refused token (401) or a stopped account (403) asks the session for the account state again, and the session
// guard ends the session with its notice (ERR-038, ERR-037). The typed values live in this component's memory only.
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

  function open(current: Loaded, form: OpenForm) {
    if (current.form !== null) return;
    validating.current = false;
    setView({ ...current, saved: false, form });
    focusOn({ kind: 'field' });
  }

  const childForm = (target: OpenChildForm['target'], values: ChildFormValues): OpenChildForm => ({
    kind: 'child',
    target,
    values,
    errors: {},
    saving: false,
    failure: null,
  });
  const pregnancyForm = (target: OpenPregnancyForm['target'], values: DateParts): OpenPregnancyForm => ({
    kind: 'pregnancy',
    target,
    values,
    error: null,
    saving: false,
    failure: null,
  });

  function edit(current: Loaded, childId: string) {
    const child = current.data.children.find((candidate) => candidate.id === childId);
    if (child !== undefined) open(current, childForm({ mode: 'edit', childId }, formValuesOf(child)));
  }

  function editJourney(current: Loaded, journeyId: string) {
    const journey = current.data.journeys.find((candidate) => candidate.id === journeyId && candidate.stage === 'pregnant');
    if (journey !== undefined) open(current, pregnancyForm({ mode: 'edit', journeyId }, dueDateValuesOf(journey)));
  }

  function close(form: OpenForm, data: OwnJourneys, saved: boolean) {
    validating.current = false;
    setView({ kind: 'loaded', data, saved, form: null });
    focusOn(openerOf(form, data));
  }

  function change(current: Loaded, form: OpenChildForm, values: ChildFormValues) {
    const checked = validating.current ? checkChildForm(values, localDateIso(new Date())) : null;
    setView({ ...current, form: { ...form, values, errors: checked !== null && !checked.ok ? checked.errors : {} } });
  }

  function changeDueDate(current: Loaded, form: OpenPregnancyForm, values: DateParts) {
    const checked = validating.current ? checkDueDateForm(values, localDateIso(new Date())) : null;
    setView({ ...current, form: { ...form, values, error: checked !== null && !checked.ok ? checked.error : null } });
  }

  async function save(current: Loaded, form: OpenForm) {
    if (saving.current) return;
    const checked = checkForm(form, localDateIso(new Date()));
    if (!checked.ok) {
      validating.current = true;
      setView({ ...current, form: checked.form });
      focusOn({ kind: 'invalid' });
      return;
    }
    saving.current = true;
    setView({ ...current, form: checked.saving });
    try {
      const accessToken = await token();
      let outcome: JourneysOutcome = accessToken === null ? { kind: 'failed' } : await checked.send(accessToken);
      if (outcome.kind === 'journeys') {
        close(form, outcome.journeys, true);
        return;
      }
      // 409 stage_conflict: another tab added a pregnancy (or planning) meanwhile. Retrying would only meet the same 409, so the
      // form closes and the view is read again, with no error (the Q3 pattern of c25); a failed read falls through to the alert.
      if (outcome.kind === 'stage-conflict' && accessToken !== null) {
        const fresh = await fetchOwnJourneys(accessToken);
        if (fresh.kind === 'journeys') {
          close(form, fresh.journeys, false);
          return;
        }
        if (fresh.kind === 'unauthenticated' || fresh.kind === 'account-unavailable') outcome = fresh;
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

  function cancel(current: Loaded, form: OpenForm) {
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
      {...(loaded !== null
        ? {
            onAdd: () => open(loaded, childForm({ mode: 'add' }, EMPTY_CHILD_FORM)),
            onEdit: (childId: string) => edit(loaded, childId),
            onAddPregnancy: () => open(loaded, pregnancyForm({ mode: 'add' }, EMPTY_DUE_DATE)),
            onEditJourney: (journeyId: string) => editJourney(loaded, journeyId),
          }
        : {})}
      {...(loaded !== null && form?.kind === 'child' ? { onChange: (values: ChildFormValues) => change(loaded, form, values) } : {})}
      {...(loaded !== null && form?.kind === 'pregnancy' ? { onDueDateChange: (values: DateParts) => changeDueDate(loaded, form, values) } : {})}
      {...(loaded !== null && form !== null ? { onSave: () => void save(loaded, form), onCancel: () => cancel(loaded, form) } : {})}
    />
  );
}
