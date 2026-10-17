import { useId } from 'react';
import { DateInput } from '@/components/shared/date-input';
import { FieldError } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { BIRTH_DATE_LABEL, CHILD_NAME_LABEL, CHILD_SEX_LABEL, SEX_OPTIONS, SEX_PLACEHOLDER } from '@/lib/child-fields';
import type { ChildFormErrors, ChildFormValues } from './journeys-form';

export interface ChildFormPanelProps {
  values: ChildFormValues;
  errors: ChildFormErrors;
  saving: boolean;
  failure: string | null;
  onChange?: (values: ChildFormValues) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

// A child's add or edit form (FR-REG-003, FR-PROFILE-002; F2.2a c3, c4, c8, c12): name, sex and birth date in three fields, all
// required, as at registration. Display only: the check and the save come in as props. The name is the form's first input and a
// failure carries `data-journeys-message`, so the section can move focus to them.
export function ChildFormPanel({ values, errors, saving, failure, onChange, onSave, onCancel }: ChildFormPanelProps) {
  const birthErrorId = useId();
  return (
    <form
      data-testid="child-form"
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
      <FormField label={CHILD_NAME_LABEL} {...(errors.name !== undefined ? { error: errors.name } : {})}>
        {(control) => (
          <TextInput
            {...control}
            autoComplete="off"
            value={values.name}
            onChange={(event) => onChange?.({ ...values, name: event.target.value })}
          />
        )}
      </FormField>
      <FormField label={CHILD_SEX_LABEL} {...(errors.sex !== undefined ? { error: errors.sex } : {})}>
        {(control) => (
          <SelectInput
            {...control}
            placeholder={SEX_PLACEHOLDER}
            options={SEX_OPTIONS}
            value={values.sex}
            onChange={(sex) => onChange?.({ ...values, sex })}
          />
        )}
      </FormField>
      <div className="flex flex-col gap-1.5">
        <DateInput
          legend={BIRTH_DATE_LABEL}
          value={values.birthDate}
          error={errors.birthDate !== undefined}
          aria-describedby={errors.birthDate !== undefined ? birthErrorId : undefined}
          onChange={(birthDate) => onChange?.({ ...values, birthDate })}
        />
        {errors.birthDate !== undefined ? <FieldError id={birthErrorId}>{errors.birthDate}</FieldError> : null}
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
