import { useId } from 'react';
import type { DateParts } from '@nestly/shared';
import { DateInput } from '@/components/shared/date-input';
import { FieldError } from '@/components/shared/field-message';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { DUE_DATE_FIELD_LABEL } from '@/lib/child-fields';

export interface PregnancyFormPanelProps {
  values: DateParts;
  error: string | null;
  saving: boolean;
  failure: string | null;
  onChange?: (values: DateParts) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

// A pregnancy's add or due-date edit form (FR-PROFILE-002, VAL-044; F2.2b c14, c15): the due date in three fields, optional, as at
// registration. Display only: the check and the save come in as props. The day is the form's first input and a failure carries
// `data-journeys-message`, so the section can move focus to them.
export function PregnancyFormPanel({ values, error, saving, failure, onChange, onSave, onCancel }: PregnancyFormPanelProps) {
  const errorId = useId();
  return (
    <form
      data-testid="pregnancy-form"
      noValidate
      className="flex min-w-0 flex-col gap-4 rounded-lg bg-card p-card-padding shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave?.();
      }}
    >
      {failure !== null ? (
        <div data-journeys-message tabIndex={-1}>
          <InlineAlert>{failure}</InlineAlert>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <DateInput
          legend={DUE_DATE_FIELD_LABEL}
          optional
          value={values}
          error={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          onChange={(dueDate) => onChange?.(dueDate)}
        />
        {error !== null ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" block pending={saving} aria-disabled={saving ? true : undefined}>
          שמירה
        </Button>
        <Button variant="text" onClick={onCancel} className="self-center">
          ביטול
        </Button>
      </div>
    </form>
  );
}
