import { useId } from 'react';
import { RECOVERY_QUESTION_IDS, RECOVERY_QUESTION_TEXTS, type RecoveryQuestionId } from '@nestly/shared';
import { FieldError } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { TextInput } from '@/components/ui/text-input';
import type { AnswerErrors, AnswerValues } from '@/lib/recovery-answers';

export interface RecoveryAnswerFieldsProps {
  /** The group's name: what the user is asked to do with the three questions. */
  legend: string;
  values: AnswerValues;
  onChange: (question: RecoveryQuestionId, value: string) => void;
  errors?: AnswerErrors;
}

// The three recovery questions as one group (F1.6): each question is the label of its answer field. A wrong count is one error on
// the group, and all three fields point at it. The answers are never remembered by the browser (autocomplete off).
export function RecoveryAnswerFields({ legend, values, onChange, errors }: RecoveryAnswerFieldsProps) {
  const groupErrorId = `${useId()}-group-error`;
  const groupError = errors?.group;
  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-1 text-label text-foreground">{legend}</legend>
      {groupError !== undefined ? <FieldError id={groupErrorId}>{groupError}</FieldError> : null}
      {RECOVERY_QUESTION_IDS.map((question) => {
        const fieldError = errors?.fields[question];
        return (
          <FormField key={question} label={RECOVERY_QUESTION_TEXTS[question]} {...(fieldError !== undefined ? { error: fieldError } : {})}>
            {(control) => (
              <TextInput
                {...control}
                autoComplete="off"
                value={values[question]}
                onChange={(event) => onChange(question, event.target.value)}
                aria-invalid={groupError !== undefined || fieldError !== undefined ? true : undefined}
                aria-describedby={[control['aria-describedby'], groupError !== undefined ? groupErrorId : undefined].filter(Boolean).join(' ') || undefined}
              />
            )}
          </FormField>
        );
      })}
    </fieldset>
  );
}
