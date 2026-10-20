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
  /** A quiet text button that stamps the current moment (a timer's start or stop, FR-TRACK-002). */
  nowLabel?: string;
  onNow?: () => void;
}

// A date (three fields) and a time (HH:MM) as texts, with the optional "now" stamp. Judging them is formToBody's job.
export function DateTimeFields({ legend, value, onChange, nowLabel, onNow }: DateTimeFieldsProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={legend}>
      <DateInput legend={`${FORM_TEXT.date}, ${legend}`} value={value.date} idPrefix={`${id}-date`} onChange={(date) => onChange({ ...value, date })} />
      <FormField label={`${FORM_TEXT.time}, ${legend}`} hint={FORM_TEXT.timeHint} className="max-w-40">
        {(control) => (
          <TextInput {...control} dir="ltr" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} />
        )}
      </FormField>
      {nowLabel !== undefined && onNow !== undefined ? (
        <button type="button" onClick={onNow} className="min-h-11 self-start rounded-sm px-1 text-label text-primary-strong underline underline-offset-4">
          {nowLabel}
        </button>
      ) : null}
    </div>
  );
}
