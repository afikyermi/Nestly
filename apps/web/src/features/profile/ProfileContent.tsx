import { useEffect, useRef } from 'react';
import type { OwnProfile } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInput } from '@/components/ui/text-input';
import { documentTitle } from '@/lib/document-title';
import { cn } from '@/lib/cn';
import { GENDER_OPTIONS } from '@/lib/profile-fields';
import {
  FULL_NAME_LABEL,
  GENDER_LABEL,
  GENDER_NOT_ANSWERED_TEXT,
  genderText,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  SAVED_TEXT,
  SAVING_TEXT,
  TITLE,
  type ProfileFormErrors,
  type ProfileFormValues,
} from './profile-form';

/** What the screen shows. The container (ProfileScreen) owns the flow; this draws one state. */
export type ProfileView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'view'; profile: OwnProfile; saved: boolean }
  | { kind: 'edit'; values: ProfileFormValues; errors: ProfileFormErrors; saving: boolean; failure: string | null };

/** Where focus goes after a change, once per `tick`: the edit button, the name field, the first invalid field, a message. */
export interface ProfileFocus {
  target: 'edit' | 'name' | 'invalid' | 'message';
  tick: number;
}

export interface ProfileContentProps {
  view: ProfileView;
  focus?: ProfileFocus;
  onRetry?: () => void;
  onEdit?: () => void;
  onChange?: (values: ProfileFormValues) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

const LOAD_FAILED_ACTION = 'נסו שוב';

// The profile screen (FR-PROFILE-001, PG-012; F2.1) inside the shell's `main`: the parent's full name and parent gender, and their
// edit form (DR-1 A). Display only: the actions come in as props. The name is user text in any language, so it is isolated.
export function ProfileContent({ view, focus, onRetry, onEdit, onChange, onSave, onCancel }: ProfileContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const nameId = 'profile-full-name-input';

  useEffect(() => {
    if (focus === undefined || focus.tick === 0) return;
    const root = rootRef.current;
    if (root === null) return;
    const target =
      focus.target === 'edit'
        ? editRef.current
        : focus.target === 'name'
          ? root.querySelector<HTMLElement>(`#${nameId}`)
          : focus.target === 'invalid'
            ? root.querySelector<HTMLElement>('[aria-invalid="true"]')
            : root.querySelector<HTMLElement>('[data-profile-message]');
    target?.focus();
  }, [focus]);

  const saved = view.kind === 'view' && view.saved;
  const status = view.kind === 'loading' ? LOADING_TEXT : view.kind === 'edit' && view.saving ? SAVING_TEXT : saved ? SAVED_TEXT : '';

  return (
    <div ref={rootRef} className="max-w-md">
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      {/* One polite region for the screen, present from the first render so its changes are announced. Only the confirmation shows. */}
      <p role="status" data-testid="profile-status" className={cn(saved ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      <div className="mt-5">
        {view.kind === 'loading' ? (
          <div data-testid="profile-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
          </div>
        ) : null}
        {view.kind === 'load-failed' ? (
          <div data-testid="profile-load-failed" className="flex flex-col items-start gap-4">
            <div data-profile-message tabIndex={-1} className="w-full">
              <InlineAlert>{view.message}</InlineAlert>
            </div>
            {/* The text of the load failure only: a stopped account has nothing to retry (ERR-037). */}
            {view.message === LOAD_FAILED_TEXT ? (
              <Button variant="soft" onClick={onRetry}>
                {LOAD_FAILED_ACTION}
              </Button>
            ) : null}
          </div>
        ) : null}
        {view.kind === 'view' ? (
          <div data-testid="profile-view" className="flex flex-col items-start gap-5">
            <dl className="flex w-full flex-col gap-4 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5">
              <div data-testid="profile-full-name">
                <dt className="inline font-semibold">{FULL_NAME_LABEL}:</dt>{' '}
                <dd className="inline">
                  <bdi dir="auto">{view.profile.fullName}</bdi>
                </dd>
              </div>
              <div data-testid="profile-parent-gender">
                <dt className="inline font-semibold">{GENDER_LABEL}:</dt>{' '}
                <dd className={cn('inline', view.profile.parentGender === null && 'text-muted-foreground')}>
                  {genderText(view.profile.parentGender)}
                </dd>
              </div>
            </dl>
            <Button ref={editRef} variant="soft" onClick={onEdit}>
              עריכה
            </Button>
          </div>
        ) : null}
        {view.kind === 'edit' ? (
          <form
            data-testid="profile-edit"
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              onSave?.();
            }}
          >
            {view.failure !== null ? (
              <div data-profile-message tabIndex={-1}>
                <InlineAlert>{view.failure}</InlineAlert>
              </div>
            ) : null}
            <FormField label={FULL_NAME_LABEL} htmlFor={nameId} {...(view.errors.fullName !== undefined ? { error: view.errors.fullName } : {})}>
              {(control) => (
                <TextInput
                  {...control}
                  autoComplete="name"
                  value={view.values.fullName}
                  onChange={(event) => onChange?.({ ...view.values, fullName: event.target.value })}
                />
              )}
            </FormField>
            <FormField label={GENDER_LABEL} optional {...(view.errors.parentGender !== undefined ? { error: view.errors.parentGender } : {})}>
              {(control) => (
                <SelectInput
                  {...control}
                  placeholder={GENDER_NOT_ANSWERED_TEXT}
                  options={GENDER_OPTIONS}
                  value={view.values.parentGender}
                  onChange={(parentGender) => onChange?.({ ...view.values, parentGender })}
                />
              )}
            </FormField>
            <div className="flex flex-col gap-3">
              <Button type="submit" size="lg" block pending={view.saving} aria-disabled={view.saving ? true : undefined}>
                שמירה
              </Button>
              <Button variant="text" onClick={onCancel} className="self-center">
                ביטול
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
