import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { inputStyles } from '../ui/text-input';

export type DateParts = { day: string; month: string; year: string };

export interface DateInputProps {
  /** Omit for an uncontrolled input. */
  value?: DateParts;
  /** The fieldset legend, e.g. the name of the date. */
  legend: string;
  error?: boolean;
  disabled?: boolean;
  /** Prefix of the three field ids; generated when absent. */
  idPrefix?: string;
  /** Id of the caller's error message (or hint), set on the fieldset. */
  'aria-describedby'?: string | undefined;
  onChange?: (value: DateParts) => void;
}

const EMPTY: DateParts = { day: '', month: '', year: '' };

// The field names are fixed (SRS FR-REG-002: day, month and year in three fields).
const FIELDS: { key: keyof DateParts; label: string }[] = [
  { key: 'day', label: 'יום' },
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
];

// Three numeric text fields in a fieldset. It emits what was typed and never validates ranges
// (Zod does, in F1.3). The DOM order is day, month, year, so in the RTL page the day sits at the
// right edge and the year at the left, the order the R2 mockup draws.
export function DateInput({ value, legend, error, disabled, idPrefix, 'aria-describedby': describedBy, onChange }: DateInputProps) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const [own, setOwn] = useState<DateParts>(EMPTY);
  const parts = value ?? own;

  return (
    <fieldset aria-describedby={describedBy} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-label text-foreground">{legend}</legend>
      <div className="grid grid-cols-4 gap-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className={cn('flex flex-col gap-1', key === 'year' && 'col-span-2')}>
            <label htmlFor={`${prefix}-${key}`} className="text-small text-muted-foreground">
              {label}
            </label>
            <input
              id={`${prefix}-${key}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              value={parts[key]}
              onChange={(event) => {
                const next = { ...parts, [key]: event.target.value };
                setOwn(next);
                onChange?.(next);
              }}
              className={inputStyles}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
