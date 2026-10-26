import { useId } from 'react';
import { PATHS } from '@/app/paths';
import { FieldError } from '@/components/shared/field-message';
import { Checkbox } from '@/components/ui/checkbox';
import { CONSENT_REQUIRED_TEXT } from './step2-form';

/** Told to a screen reader on each document link (WCAG 3.2.5): the link opens a new tab, so the form stays where it is. */
export const NEW_TAB_TEXT = 'נפתח בכרטיסייה חדשה';

const LINK = 'text-primary-strong underline underline-offset-4';

export interface ConsentFieldProps {
  checked: boolean;
  /** Shows the error: the checkbox is invalid and the message is linked to it. */
  error: boolean;
  /** The id of the error message. */
  errorId: string;
  onCheckedChange: (checked: boolean) => void;
}

// The one consent (BR-068, F1.4 Q5): terms of use, privacy policy and the declaration of age 18 or older. Used by registration
// step 2 and by the completion step (F1.5), so the text and the links stay the same in both.
export function ConsentField({ checked, error, errorId, onCheckedChange }: ConsentFieldProps) {
  const newTabId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      {/* The description of both links, outside the label, so the checkbox's name stays the one sentence (BR-068). */}
      <span id={newTabId} hidden>
        {NEW_TAB_TEXT}
      </span>
      <Checkbox checked={checked} error={error} aria-describedby={error ? errorId : undefined} onCheckedChange={onCheckedChange}>
        אישור{' '}
        <a href={PATHS.terms} target="_blank" rel="noopener noreferrer" aria-describedby={newTabId} className={LINK}>
          תנאי השימוש
        </a>
        {' '}ו
        <a href={PATHS.privacy} target="_blank" rel="noopener noreferrer" aria-describedby={newTabId} className={LINK}>
          מדיניות הפרטיות
        </a>
        , והצהרה על גיל 18 ומעלה
      </Checkbox>
      {error ? <FieldError id={errorId}>{CONSENT_REQUIRED_TEXT}</FieldError> : null}
    </div>
  );
}
