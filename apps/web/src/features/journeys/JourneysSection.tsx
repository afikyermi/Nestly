import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateIso, type DateParts, type OwnJourneys } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { CHILDREN_LIMIT_TEXT } from '@/lib/child-fields';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import {
  addOwnChild,
  addOwnPregnancy,
  endOwnPregnancy,
  fetchOwnJourneys,
  recordOwnBirth,
  removeOwnChild,
  saveOwnChild,
  saveOwnDueDate,
  type JourneysOutcome,
} from '@/services/api/journeys';
import {
  JourneysContent,
  type ConfirmTarget,
  type JourneysFocus,
  type JourneysView,
  type OpenChildForm,
  type OpenForm,
  type OpenPregnancyForm,
} from './JourneysContent';
import {
  ACTION_FAILED_TEXT,
  canAddPregnancy,
  checkChildForm,
  checkDueDateForm,
  dueDateValuesOf,
  EMPTY_CHILD_FORM,
  EMPTY_DUE_DATE,
  formValuesOf,
  hasPlanning,
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
  if (form.kind === 'confirm') {
    const { target } = form;
    // Ending "מתכננים" sends nothing by itself: confirming it opens the pregnancy form (proceedToPregnancy), never this.
    if (target.action === 'end-planning') return { ok: false, form };
    return {
      ok: true,
      saving: { ...form, saving: true, failure: null },
      send: (accessToken) =>
        target.action === 'remove-child' ? removeOwnChild(accessToken, target.childId) : endOwnPregnancy(accessToken, target.journeyId),
    };
  }
  if (form.kind === 'child') {
    const checked = checkChildForm(form.values, today);
    if (!checked.ok) return { ok: false, form: { ...form, errors: checked.errors, failure: null } };
    const { target } = form;
    return {
      ok: true,
      saving: { ...form, errors: {}, saving: true, failure: null },
      send: (accessToken) => {
        if (target.mode === 'add') return addOwnChild(accessToken, checked.value);
        if (target.mode === 'birth') return recordOwnBirth(accessToken, target.journeyId, checked.value);
        return saveOwnChild(accessToken, target.childId, checked.value);
      },
    };
  }
  const checked = checkDueDateForm(form.values, today);
  if (!checked.ok) return { ok: false, form: { ...form, error: checked.error, failure: null } };
  const { target } = form;
  return {
    ok: true,
    saving: { ...form, error: null, saving: true, failure: null },
    send: (accessToken) =>
      target.mode === 'add'
        ? addOwnPregnancy(accessToken, checked.value, target.endPlanning === true)
        : saveOwnDueDate(accessToken, target.journeyId, checked.value),
  };
}

/** Whether `form` deletes the item it was opened on: its opener is gone after a save, and a 404 means it is gone already (Q3). */
const deletes = (form: OpenForm): boolean => form.kind === 'confirm' || (form.kind === 'child' && form.target.mode === 'birth');

/** The button that opened confirmation `target`. */
function confirmOpener(target: ConfirmTarget): JourneysFocus['target'] {
  if (target.action === 'remove-child') return { kind: 'remove', childId: target.childId };
  if (target.action === 'end-pregnancy') return { kind: 'end-pregnancy', journeyId: target.journeyId };
  return { kind: 'add-pregnancy' };
}

/**
 * The button that opened `form`, to take focus back when it closes. After a removal, an end or a birth that button is gone: the
 * section's heading (c26). After a pregnancy add (or a refused one, refreshed), the pregnancy's "עריכה".
 */
function openerOf(form: OpenForm, data: OwnJourneys, saved: boolean): JourneysFocus['target'] {
  if (saved && deletes(form)) return { kind: 'title' };
  if (form.kind === 'confirm') return confirmOpener(form.target);
  if (form.kind === 'child') {
    if (form.target.mode === 'add') return { kind: 'add' };
    return form.target.mode === 'birth' ? { kind: 'birth', journeyId: form.target.journeyId } : { kind: 'edit', childId: form.target.childId };
  }
  if (form.target.mode === 'edit') return { kind: 'edit-journey', journeyId: form.target.journeyId };
  const added = data.journeys.find((journey) => journey.stage === 'pregnant');
  if (added !== undefined) return { kind: 'edit-journey', journeyId: added.id };
  // No pregnancy to land on: "הוספת הריון" while it is still offered, else "הוספת ילד", which every view has.
  return canAddPregnancy(data) ? { kind: 'add-pregnancy' } : { kind: 'add' };
}

// The "המסע שלי" section's flow (FR-PROFILE-002, PG-012; F2.2a, F2.2b): load the own journeys and children, show them, add, edit or
// remove a child, add a pregnancy (ending "מתכננים" after a confirmation), edit its due date, end it, record its birth. A removal and
// an end are confirmed first (DR-1 A). The server and RLS decide whose rows they are; this section sends a row id only,
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
    // A confirmation takes focus to its "ביטול" itself (Q4).
    if (form.kind !== 'confirm') focusOn({ kind: 'field' });
  }

  const confirmation = (target: ConfirmTarget): OpenForm => ({ kind: 'confirm', target, saving: false, failure: null });

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

  function addPregnancy(current: Loaded) {
    if (hasPlanning(current.data)) open(current, confirmation({ action: 'end-planning' }));
    else open(current, pregnancyForm({ mode: 'add' }, EMPTY_DUE_DATE));
  }

  /** "מתכננים" will end (c16 confirmed): the pregnancy form, whose save ends it in the same request (c23). Nothing is sent yet. */
  function proceedToPregnancy(current: Loaded) {
    validating.current = false;
    setView({ ...current, form: pregnancyForm({ mode: 'add', endPlanning: true }, EMPTY_DUE_DATE) });
    focusOn({ kind: 'field' });
  }

  function close(form: OpenForm, data: OwnJourneys, saved: boolean, target: JourneysFocus['target'] = openerOf(form, data, saved)) {
    validating.current = false;
    setView({ kind: 'loaded', data, saved, form: null });
    focusOn(target);
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
    if (form.kind === 'confirm' && form.target.action === 'end-planning') {
      proceedToPregnancy(current);
      return;
    }
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
      // 409 stage_conflict: another tab added a pregnancy meanwhile; 404 on a removal, an end or a birth: another tab removed it
      // (Q3). Retrying would only meet the same answer, so the form or dialog closes and the view is read again, with no error
      // (c25); a failed read falls through to the alert.
      const gone = outcome.kind === 'not-found' && deletes(form);
      if ((outcome.kind === 'stage-conflict' || gone) && accessToken !== null) {
        const fresh = await fetchOwnJourneys(accessToken);
        if (fresh.kind === 'journeys') {
          close(form, fresh.journeys, false, gone ? { kind: 'title' } : openerOf(form, fresh.journeys, false));
          return;
        }
        if (fresh.kind === 'unauthenticated' || fresh.kind === 'account-unavailable') outcome = fresh;
      }
      // A refused token or a stopped account closes a confirmation (c24): the session guard takes over, ERR-037 replaces the view.
      if (form.kind === 'confirm' && (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable')) {
        const stopped = refused(outcome);
        if (stopped === null) close(form, current.data, false);
        else {
          setView({ kind: 'load-failed', message: stopped });
          focusOn({ kind: 'message' });
        }
        return;
      }
      // The form keeps what is in it now, including anything typed while the save was in flight. A dialog keeps focus on its control.
      const fallback = form.kind === 'confirm' ? ACTION_FAILED_TEXT : SAVE_FAILED_TEXT;
      const failure = outcome.kind === 'too-many' ? CHILDREN_LIMIT_TEXT : (refused(outcome) ?? fallback);
      setView((latest) =>
        latest.kind === 'loaded' && latest.form !== null ? { ...latest, form: { ...latest.form, saving: false, failure } } : latest,
      );
      if (form.kind !== 'confirm') focusOn({ kind: 'message' });
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
            onAddPregnancy: () => addPregnancy(loaded),
            onEditJourney: (journeyId: string) => editJourney(loaded, journeyId),
            onRemove: (childId: string) => open(loaded, confirmation({ action: 'remove-child', childId })),
            onEndPregnancy: (journeyId: string) => open(loaded, confirmation({ action: 'end-pregnancy', journeyId })),
            onBirth: (journeyId: string) => open(loaded, childForm({ mode: 'birth', journeyId }, EMPTY_CHILD_FORM)),
          }
        : {})}
      {...(loaded !== null && form?.kind === 'child' ? { onChange: (values: ChildFormValues) => change(loaded, form, values) } : {})}
      {...(loaded !== null && form?.kind === 'pregnancy' ? { onDueDateChange: (values: DateParts) => changeDueDate(loaded, form, values) } : {})}
      {...(loaded !== null && form !== null ? { onSave: () => void save(loaded, form), onCancel: () => cancel(loaded, form) } : {})}
    />
  );
}
