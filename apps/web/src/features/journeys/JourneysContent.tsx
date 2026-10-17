import { useEffect, useId, useRef } from 'react';
import { MAX_CHILDREN, type OwnJourneys } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { CHILDREN_LIMIT_TEXT } from '@/lib/child-fields';
import { ChildFormPanel } from './ChildFormPanel';
import {
  ADD_CHILD_TEXT,
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
  target: ChildFormTarget;
  values: ChildFormValues;
  errors: ChildFormErrors;
  saving: boolean;
  failure: string | null;
}

/** What the section shows. The container (JourneysSection) owns the flow; this draws one state. */
export type JourneysView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'loaded'; data: OwnJourneys; saved: boolean; form: OpenChildForm | null };

/** Where focus goes after a change, once per `tick`: an opening button, the form's name, its first invalid field, a message. */
export interface JourneysFocus {
  target: { kind: 'add' } | { kind: 'edit'; childId: string } | { kind: 'name' } | { kind: 'invalid' } | { kind: 'message' };
  tick: number;
}

export interface JourneysContentProps {
  view: JourneysView;
  focus?: JourneysFocus;
  onRetry?: () => void;
  onAdd?: () => void;
  onEdit?: (childId: string) => void;
  onChange?: (values: ChildFormValues) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

function focusTarget(root: HTMLElement, target: JourneysFocus['target']): HTMLElement | null {
  switch (target.kind) {
    case 'add':
      return root.querySelector<HTMLElement>('[data-journeys-add]');
    case 'edit':
      return Array.from(root.querySelectorAll<HTMLElement>('[data-journeys-edit]')).find((b) => b.dataset.journeysEdit === target.childId) ?? null;
    case 'name':
      return root.querySelector<HTMLElement>('[data-testid="child-form"] input');
    case 'invalid':
      return root.querySelector<HTMLElement>('[data-testid="child-form"] [aria-invalid="true"]');
    case 'message':
      return root.querySelector<HTMLElement>('[data-journeys-message]');
  }
}

// "המסע שלי" on the profile page (FR-PROFILE-002, PG-012; F2.2a): the parent's journeys and children, a child's add and edit form.
// Display only: the actions come in as props. While a form is open the other actions are not offered, so one form is open at a time.
// Children's names are user text in any language, so they are isolated.
export function JourneysContent({ view, focus, onRetry, onAdd, onEdit, onChange, onSave, onCancel }: JourneysContentProps) {
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
                    {journeyText(journey)}
                  </li>
                ))}
              </ul>
            ) : null}
            {loaded.data.children.length > 0 ? (
              <ul data-testid="children-list" className="flex flex-col gap-3">
                {loaded.data.children.map((child) => {
                  const editing = form?.target.mode === 'edit' && form.target.childId === child.id ? form : null;
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
            {form?.target.mode === 'add' ? formPanel(form) : null}
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
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
