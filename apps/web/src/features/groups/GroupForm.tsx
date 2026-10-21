import { useId, useState } from 'react';
import { checkCreateGroup, type CreateGroupBody, type GroupPrivacy } from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { DESCRIPTION_LABEL, FIELD_ERRORS, NAME_LABEL, PRIVACY_HINT, PRIVACY_LABEL, PRIVACY_LEGEND, RULES_LABEL } from './groups-texts';

export interface GroupFormValues {
  name: string;
  description: string;
  rules: string;
  privacy: GroupPrivacy;
}

export type GroupFieldErrors = Partial<Record<'name' | 'description' | 'rules', string>>;

const PRIVACY_OPTIONS = (['public', 'private'] as const).map((value) => ({ value, label: PRIVACY_LABEL[value], description: PRIVACY_HINT[value] }));

/** The values as the API takes them (VAL-028): the same schema the server checks; a field's error is said under the field. */
export function checkGroupForm(values: GroupFormValues): { ok: true; value: CreateGroupBody } | { ok: false; errors: GroupFieldErrors } {
  const checked = checkCreateGroup({ name: values.name, description: values.description, rules: values.rules, privacy: values.privacy });
  if (checked.ok) return { ok: true, value: checked.value };
  switch (checked.reason) {
    case 'name_too_short':
    case 'name_too_long':
      return { ok: false, errors: { name: FIELD_ERRORS[checked.reason] } };
    case 'description_too_long':
      return { ok: false, errors: { description: FIELD_ERRORS.description_too_long } };
    case 'rules_too_long':
      return { ok: false, errors: { rules: FIELD_ERRORS.rules_too_long } };
    default:
      return { ok: false, errors: { name: FIELD_ERRORS.name_too_short } };
  }
}

export interface GroupFormProps {
  initial: GroupFormValues;
  /** Only the Owner changes Public/Private (VAL-021); others see the choice disabled. */
  privacyEditable: boolean;
  submitLabel: string;
  pendingLabel: string;
  failure: string | null;
  onSubmit: (values: GroupFormValues) => Promise<GroupFieldErrors | null>;
}

// The Group's details (PG-043 create, PG-035 edit): name, description, rules and Public/Private. Display and the field checks only; what
// submitting does comes in as `onSubmit`, which answers the field errors the server named, or null.
export function GroupForm({ initial, privacyEditable, submitLabel, pendingLabel, failure, onSubmit }: GroupFormProps) {
  const ids = useId();
  const [values, setValues] = useState<GroupFormValues>(initial);
  const [errors, setErrors] = useState<GroupFieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    const checked = checkGroupForm(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const refused = await onSubmit(values);
    setSaving(false);
    if (refused !== null) setErrors(refused);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
      <FormField label={NAME_LABEL} htmlFor={`${ids}-name`} {...(errors.name === undefined ? {} : { error: errors.name })}>
        {(control) => <TextInput {...control} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />}
      </FormField>
      <FormField label={DESCRIPTION_LABEL} htmlFor={`${ids}-description`} optional {...(errors.description === undefined ? {} : { error: errors.description })}>
        {(control) => <TextArea {...control} rows={3} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />}
      </FormField>
      <ChoiceCardGroup
        legend={PRIVACY_LEGEND}
        name={`${ids}-privacy`}
        options={PRIVACY_OPTIONS}
        value={values.privacy}
        disabled={!privacyEditable}
        onChange={(value) => {
          if (value === 'public' || value === 'private') setValues({ ...values, privacy: value });
        }}
      />
      <FormField label={RULES_LABEL} htmlFor={`${ids}-rules`} optional {...(errors.rules === undefined ? {} : { error: errors.rules })}>
        {(control) => <TextArea {...control} rows={3} value={values.rules} onChange={(event) => setValues({ ...values, rules: event.target.value })} />}
      </FormField>
      <Button type="submit" size="lg" block pending={saving}>
        {saving ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
