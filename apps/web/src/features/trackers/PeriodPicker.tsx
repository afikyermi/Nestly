import { useState } from 'react';
import { addDaysIso, checkDateParts, checkPeriod, israelDay, type Period } from '@nestly/shared';
import { DateInput, type DateParts } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { PERIOD_TEXT } from '@/lib/tracker-texts';

const PRESET_DAYS = { week: 7, month: 30, quarter: 90, year: 365 } as const;
type PresetKey = keyof typeof PRESET_DAYS;
type Preset = PresetKey | 'custom';
const PRESET_KEYS: PresetKey[] = ['week', 'month', 'quarter', 'year'];

const options = [
  { value: 'week', label: PERIOD_TEXT.week },
  { value: 'month', label: PERIOD_TEXT.month },
  { value: 'quarter', label: PERIOD_TEXT.quarter },
  { value: 'year', label: PERIOD_TEXT.year },
  { value: 'custom', label: PERIOD_TEXT.custom },
];

/** The last `days` Israeli days, today included. */
export function lastDays(days: number, now: Date = new Date()): Period {
  const to = israelDay(now);
  return { from: addDaysIso(to, -(days - 1)), to };
}

export const DEFAULT_PERIOD_DAYS = PRESET_DAYS.month;

const EMPTY: DateParts = { day: '', month: '', year: '' };

// The period of a chart and a history: a preset (7 days, 30 days, 3 months, a year) or a range of two days the user types (FR-TRACK-001).
export function PeriodPicker({ onChange }: { onChange: (period: Period) => void }) {
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState<DateParts>(EMPTY);
  const [to, setTo] = useState<DateParts>(EMPTY);
  const [error, setError] = useState(false);

  function choose(value: string) {
    setError(false);
    if (value === 'custom') return setPreset('custom');
    for (const key of PRESET_KEYS) {
      if (key !== value) continue;
      setPreset(key);
      onChange(lastDays(PRESET_DAYS[key]));
    }
  }

  function apply() {
    const start = checkDateParts(from);
    const end = checkDateParts(to);
    const checked = start.kind === 'date' && end.kind === 'date' ? checkPeriod(start.iso, end.iso) : { ok: false as const };
    if (!checked.ok) return setError(true);
    setError(false);
    onChange(checked.value);
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label={PERIOD_TEXT.legend} className="max-w-60">
        {(control) => <SelectInput {...control} placeholder={PERIOD_TEXT.legend} value={preset} options={options} onChange={choose} />}
      </FormField>
      {preset === 'custom' ? (
        <div className="flex flex-col gap-3">
          {error ? <InlineAlert>{PERIOD_TEXT.invalid}</InlineAlert> : null}
          <DateInput legend={PERIOD_TEXT.from} value={from} onChange={setFrom} />
          <DateInput legend={PERIOD_TEXT.to} value={to} onChange={setTo} />
          <Button type="button" variant="soft" className="self-start" onClick={apply}>
            {PERIOD_TEXT.apply}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
