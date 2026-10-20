import { useId } from 'react';
import { DateInput } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { TextInput } from '@/components/ui/text-input';
import { FORM_TEXT } from '@/lib/tracker-texts';
import type { DateTimeText } from './tracker-form';

export interface DateTimeFieldsProps {
  legend: string;
  value: DateTimeText;
  onChange: (value: DateTimeText) => void;
}

// A date (three fields) and a time (HH:MM) as texts, with the optional "now" stamp. Judging them is formToBody's job.
export function DateTimeFields({ legend, value, onChange }: DateTimeFieldsProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={legend}>
      <DateInput legend={`${FORM_TEXT.date}, ${legend}`} value={value.date} idPrefix={`${id}-date`} onChange={(date) => onChange({ ...value, date })} />
      <FormField label={`${FORM_TEXT.time}, ${legend}`} hint={FORM_TEXT.timeHint} className="max-w-40">
        {(control) => (
          <TextInput {...control} dir="ltr" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} />
        )}
      </FormField>
    </div>
  );
}
