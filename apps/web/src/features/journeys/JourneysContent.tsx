import { useEffect, useId, useRef } from 'react';
import { MAX_CHILDREN, type DateParts, type OwnJourney, type OwnJourneys } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { CHILDREN_LIMIT_TEXT } from '@/lib/child-fields';
import { ChildFormPanel } from './ChildFormPanel';
import { PregnancyFormPanel } from './PregnancyFormPanel';
import {
  ADD_CHILD_TEXT,
  ADD_PREGNANCY_TEXT,
  canAddPregnancy,
  childDetailsText,
  EDIT_TEXT,
  journeyText,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  RETRY_TEXT,
  SAVED_TEXT,
  SAVING_TEXT,
  SECTION_TITLE,
  type ChildFormErrors,
  type ChildFormValues,
} from './journeys-form';

/** Which form is open: a new child, or the stored child `childId`. One at a time. */
export type ChildFormTarget = { mode: 'add' } | { mode: 'edit'; childId: string };

export interface OpenChildForm {
  kind: 'child';
  target: ChildFormTarget;
  values: ChildFormValues;
  errors: ChildFormErrors;
  saving: boolean;
  failure: string | null;
}

/** Which pregnancy form is open: a new pregnancy, or the due date of the stored pregnancy `journeyId` (F2.2b c14, c15). */
export type PregnancyFormTarget = { mode: 'add' } | { mode: 'edit'; journeyId: string };

export interface OpenPregnancyForm {
  kind: 'pregnancy';
  target: PregnancyFormTarget;
  values: DateParts;
  error: string | null;
  saving: boolean;
  failure: string | null;
}

/** The one open form of the section, if any. */
export type OpenForm = OpenChildForm | OpenPregnancyForm;

/** What the section shows. The container (JourneysSection) owns the flow; this draws one state. */
export type JourneysView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'loaded'; data: OwnJourneys; saved: boolean; form: OpenForm | null };

/** Where focus goes after a change, once per `tick`: an opening button, the form's first field, its first invalid field, a message. */
export interface JourneysFocus {
  target:
    | { kind: 'add' }
    | { kind: 'edit'; childId: string }
    | { kind: 'add-pregnancy' }
    | { kind: 'edit-journey'; journeyId: string }
    | { kind: 'field' }
    | { kind: 'invalid' }
    | { kind: 'message' };
  tick: number;
}

export interface JourneysContentProps {
  view: JourneysView;
  focus?: JourneysFocus;
  onRetry?: () => void;
  onAdd?: () => void;
  onEdit?: (childId: string) => void;
  onAddPregnancy?: () => void;
  onEditJourney?: (journeyId: string) => void;
  onChange?: (values: ChildFormValues) => void;
  onDueDateChange?: (values: DateParts) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

function focusTarget(root: HTMLElement, target: JourneysFocus['target']): HTMLElement | null {
  switch (target.kind) {
    case 'add':
      return root.querySelector<HTMLElement>('[data-journeys-add]');
    case 'edit':
      return Array.from(root.querySelectorAll<HTMLElement>('[data-journeys-edit]')).find((b) => b.dataset.journeysEdit === target.childId) ?? null;
    case 'add-pregnancy':
      return root.querySelector<HTMLElement>('[data-journeys-add-pregnancy]');
    case 'edit-journey':
      return (
        Array.from(root.querySelectorAll<HTMLElement>('[data-journeys-edit-journey]')).find((b) => b.dataset.journeysEditJourney === target.journeyId) ??
        null
      );
    case 'field':
      return root.querySelector<HTMLElement>('form input');
    case 'invalid':
      return root.querySelector<HTMLElement>('form [aria-invalid="true"]');
    case 'message':
      return root.querySelector<HTMLElement>('[data-journeys-message]');
  }
}

// "המסע שלי" on the profile page (FR-PROFILE-002, PG-012; F2.2a, F2.2b1): the parent's journeys and children, a child's add and edit
// form, a pregnancy's add and due-date form. Display only: the actions come in as props. While a form is open the other actions are
// not offered, so one form is open at a time. Children's names are user text in any language, so they are isolated.
export function JourneysContent(props: JourneysContentProps) {
  const { view, focus, onRetry, onAdd, onEdit, onAddPregnancy, onEditJourney, onChange, onDueDateChange, onSave, onCancel } = props;
  const rootRef = useRef<HTMLElement>(null);
  const ids = useId();
  const titleId = `${ids}-title`;
  const limitId = `${ids}-limit`;

  useEffect(() => {
    if (focus === undefined || focus.tick === 0 || rootRef.current === null) return;
    focusTarget(rootRef.current, focus.target)?.focus();
  }, [focus]);

  const loaded = view.kind === 'loaded' ? view : null;
  const form = loaded?.form ?? null;
  const saved = loaded !== null && loaded.saved;
  const status = view.kind === 'loading' ? LOADING_TEXT : form?.saving ? SAVING_TEXT : saved ? SAVED_TEXT : '';
  const atLimit = loaded !== null && loaded.data.children.length >= MAX_CHILDREN;
  const childForm = form?.kind === 'child' ? form : null;
  const pregnancyForm = form?.kind === 'pregnancy' ? form : null;
  const pregnancyPanel = (open: OpenPregnancyForm) => (
    <PregnancyFormPanel
      values={open.values}
      error={open.error}
      saving={open.saving}
      failure={open.failure}
      {...(onDueDateChange !== undefined ? { onChange: onDueDateChange } : {})}
      {...(onSave !== undefined ? { onSave } : {})}
      {...(onCancel !== undefined ? { onCancel } : {})}
    />
  );
  const journeyRow = (journey: OwnJourney) => {
    const textId = `${ids}-journey-${journey.id}`;
    // Only a pregnancy has something to edit: its due date (DR-5 A). A stage changes only by add or end.
    if (journey.stage !== 'pregnant' || form !== null) return <span id={textId}>{journeyText(journey)}</span>;
    return (
      <div className="flex items-center justify-between gap-3">
        <span id={textId} className="min-w-0 break-words">
          {journeyText(journey)}
        </span>
        <Button variant="soft" data-journeys-edit-journey={journey.id} aria-describedby={textId} onClick={() => onEditJourney?.(journey.id)}>
          {EDIT_TEXT}
        </Button>
      </div>
    );
  };
  const formPanel = (open: OpenChildForm) => (
    <ChildFormPanel
      values={open.values}
      errors={open.errors}
      saving={open.saving}
      failure={open.failure}
      {...(onChange !== undefined ? { onChange } : {})}
      {...(onSave !== undefined ? { onSave } : {})}
      {...(onCancel !== undefined ? { onCancel } : {})}
    />
  );

  return (
    <section ref={rootRef} aria-labelledby={titleId} data-testid="journeys" className="max-w-md">
      <h2 id={titleId} className="text-h3">
        {SECTION_TITLE}
      </h2>
      {/* One polite region for the section, present from the first render so its changes are announced. Only the confirmation shows. */}
      <p role="status" data-testid="journeys-status" className={cn(saved ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      <div className="mt-4">
        {view.kind === 'loading' ? (
          <div data-testid="journeys-loading" aria-hidden="true" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
          </div>
        ) : null}
        {view.kind === 'load-failed' ? (
          <div data-testid="journeys-load-failed" className="flex flex-col items-start gap-4">
            <div data-journeys-message tabIndex={-1} className="w-full">
              <InlineAlert>{view.message}</InlineAlert>
            </div>
            {/* The text of the load failure only: a stopped account has nothing to retry (ERR-037). */}
            {view.message === LOAD_FAILED_TEXT ? (
              <Button variant="soft" onClick={onRetry}>
                {RETRY_TEXT}
              </Button>
            ) : null}
          </div>
        ) : null}
        {loaded !== null ? (
          <div data-testid="journeys-view" className="flex flex-col gap-5">
            {loaded.data.journeys.length > 0 ? (
              <ul data-testid="journeys-list" className="flex flex-col gap-2 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5">
                {loaded.data.journeys.map((journey) => (
                  <li key={journey.id} data-testid="journey-row">
                    {journeyRow(journey)}
                  </li>
                ))}
              </ul>
            ) : null}
            {pregnancyForm?.target.mode === 'edit' ? pregnancyPanel(pregnancyForm) : null}
            {loaded.data.children.length > 0 ? (
              <ul data-testid="children-list" className="flex flex-col gap-3">
                {loaded.data.children.map((child) => {
                  const editing = childForm?.target.mode === 'edit' && childForm.target.childId === child.id ? childForm : null;
                  const textId = `${ids}-child-${child.id}`;
                  return (
                    <li key={child.id} data-testid="child-row">
                      {editing !== null ? (
                        formPanel(editing)
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card">
                          <p id={textId} className="min-w-0 break-words">
                            <bdi dir="auto">{child.name}</bdi> · {childDetailsText(child)}
                          </p>
                          {form === null ? (
                            <Button variant="soft" data-journeys-edit={child.id} aria-describedby={textId} onClick={() => onEdit?.(child.id)}>
                              {EDIT_TEXT}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {childForm?.target.mode === 'add' ? formPanel(childForm) : null}
            {pregnancyForm?.target.mode === 'add' ? pregnancyPanel(pregnancyForm) : null}
            {form === null ? (
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="soft"
                  block
                  data-journeys-add
                  aria-disabled={atLimit ? true : undefined}
                  aria-describedby={atLimit ? limitId : undefined}
                  onClick={() => {
                    if (!atLimit) onAdd?.();
                  }}
                >
                  {ADD_CHILD_TEXT}
                </Button>
                {atLimit ? (
                  <p id={limitId} className="text-small text-muted-foreground">
                    {CHILDREN_LIMIT_TEXT}
                  </p>
                ) : null}
                {/* VAL-039: with a pregnancy or "מתכננים" stored, a pregnancy cannot be added here (F2.2b c15). */}
                {canAddPregnancy(loaded.data) ? (
                  <Button variant="soft" block data-journeys-add-pregnancy className="mt-1.5" onClick={onAddPregnancy}>
                    {ADD_PREGNANCY_TEXT}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
