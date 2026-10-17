import { useEffect, useRef } from 'react';
import { PROFILE_VISIBILITIES, type PrivacySettings, type ProfileVisibility } from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import {
  BIRTHDAY_LABEL,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  RETRY_LABEL,
  SAVE_LABEL,
  SAVED_TEXT,
  SAVING_TEXT,
  SENTENCE_LABEL,
  TITLE,
  VISIBILITY_LEGEND,
  VISIBILITY_OPTIONS,
} from './privacy-texts';

/** What the section shows. The container (PrivacySettingsSection) owns the flow; this draws one state. */
export type PrivacyView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'form'; values: PrivacySettings; saving: boolean; failure: string | null; saved: boolean };

/** Where focus goes after a change, once per `tick`: the selected visibility option, or the message. */
export interface PrivacyFocus {
  target: 'start' | 'message';
  tick: number;
}

export interface PrivacyContentProps {
  view: PrivacyView;
  focus?: PrivacyFocus;
  onRetry?: () => void;
  onChange?: (values: PrivacySettings) => void;
  onSave?: () => void;
}

const isVisibility = (value: string): value is ProfileVisibility => PROFILE_VISIBILITIES.some((visibility) => visibility === value);

// The Privacy & Security section of Settings (FR-PRIV-001, BR-037, PG-038; F2.3a): visibility to non-Friends as a labelled radio
// group, the Journey Summary sentence and the child-birthday consent as checkboxes, one Save for the three (Q2). Display only: the
// actions come in as props. While loading, no value and no control is drawn (c4).
export function PrivacyContent({ view, focus, onRetry, onChange, onSave }: PrivacyContentProps) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focus === undefined || focus.tick === 0) return;
    const root = rootRef.current;
    if (root === null) return;
    const target =
      focus.target === 'start'
        ? root.querySelector<HTMLElement>('[role="radiogroup"] input:checked')
        : root.querySelector<HTMLElement>('[data-privacy-message]');
    target?.focus();
  }, [focus]);

  const saved = view.kind === 'form' && view.saved;
  const status = view.kind === 'loading' ? LOADING_TEXT : view.kind === 'form' && view.saving ? SAVING_TEXT : saved ? SAVED_TEXT : '';

  return (
    <section ref={rootRef} aria-labelledby="privacy-title" className="max-w-md">
      <h2 id="privacy-title" className="text-h3">
        {TITLE}
      </h2>
      {/* One polite region for the section, present from the first render so its changes are announced. Only the confirmation shows. */}
      <p role="status" data-testid="privacy-status" className={cn(saved ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      <div className="mt-4">
        {view.kind === 'loading' ? (
          <div data-testid="privacy-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
            <Skeleton className="w-3/4" />
          </div>
        ) : null}
        {view.kind === 'load-failed' ? (
          <div data-testid="privacy-load-failed" className="flex flex-col items-start gap-4">
            <div data-privacy-message tabIndex={-1} className="w-full">
              <InlineAlert>{view.message}</InlineAlert>
            </div>
            {/* The text of the load failure only: a stopped account has nothing to retry (ERR-037). */}
            {view.message === LOAD_FAILED_TEXT ? (
              <Button variant="soft" onClick={onRetry}>
                {RETRY_LABEL}
              </Button>
            ) : null}
          </div>
        ) : null}
        {view.kind === 'form' ? (
          <form
            data-testid="privacy-form"
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              onSave?.();
            }}
          >
            {view.failure !== null ? (
              <div data-privacy-message tabIndex={-1}>
                <InlineAlert>{view.failure}</InlineAlert>
              </div>
            ) : null}
            <ChoiceCardGroup
              legend={VISIBILITY_LEGEND}
              name="profile-visibility"
              options={VISIBILITY_OPTIONS}
              value={view.values.profileVisibility}
              disabled={view.saving}
              onChange={(value) => {
                if (isVisibility(value)) onChange?.({ ...view.values, profileVisibility: value });
              }}
            />
            <div className="flex flex-col gap-2">
              <Checkbox
                checked={view.values.isEmptyJourneySentenceShown}
                disabled={view.saving}
                onCheckedChange={(checked) => onChange?.({ ...view.values, isEmptyJourneySentenceShown: checked })}
              >
                {SENTENCE_LABEL}
              </Checkbox>
              <Checkbox
                checked={view.values.isChildBirthdayShared}
                disabled={view.saving}
                onCheckedChange={(checked) => onChange?.({ ...view.values, isChildBirthdayShared: checked })}
              >
                {BIRTHDAY_LABEL}
              </Checkbox>
            </div>
            <Button type="submit" size="lg" block pending={view.saving} aria-disabled={view.saving ? true : undefined}>
              {SAVE_LABEL}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
