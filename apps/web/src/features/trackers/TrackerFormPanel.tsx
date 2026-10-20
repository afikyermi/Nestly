import { DIAPER_KINDS, BREASTFEEDING_SIDES, type TrackerKind } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { DIAPER_LABEL, FORM_TEXT, SIDE_LABEL } from '@/lib/tracker-texts';
import { DateTimeFields } from './DateTimeFields';
import { dateTimeOf, type EventForm } from './tracker-form';

export interface TrackerFormPanelProps {
  kind: TrackerKind;
  form: EventForm;
  /** The children to choose from; the choice is shown when there is more than one and the form creates. */
  children: { id: string; name: string }[];
  editing: boolean;
  pending: boolean;
  error: string | null;
  onChange: (form: EventForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const sideOptions = BREASTFEEDING_SIDES.map((value) => ({ value, label: SIDE_LABEL[value] ?? value }));
const diaperOptions = DIAPER_KINDS.map((value) => ({ value, label: DIAPER_LABEL[value] ?? value }));

// The fields of one tracker (OP-008): time, child, one main value, an optional note. Presentational: it owns no state and calls no
// API; the screen decides what saving does.
export function TrackerFormPanel({ kind, form, children, editing, pending, error, onChange, onSubmit, onCancel }: TrackerFormPanelProps) {
  const set = (patch: Partial<EventForm>) => onChange({ ...form, ...patch });
  const ranged = kind === 'breastfeeding' || kind === 'sleep';
  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-lg bg-card p-4 text-card-foreground shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {error !== null ? <InlineAlert>{error}</InlineAlert> : null}
      {!editing && children.length > 1 ? (
        <FormField label={FORM_TEXT.child}>
          {(control) => (
            <SelectInput
              {...control}
              placeholder={FORM_TEXT.childPlaceholder}
              value={form.childId}
              options={children.map((child) => ({ value: child.id, label: child.name }))}
              onChange={(childId) => set({ childId })}
            />
          )}
        </FormField>
      ) : null}
      <DateTimeFields
        legend={ranged ? FORM_TEXT.start : FORM_TEXT.when}
        value={form.start}
        onChange={(start) => set({ start })}
        {...(ranged ? { nowLabel: FORM_TEXT.startNow, onNow: () => set({ start: dateTimeOf(new Date()) }) } : {})}
      />
      {ranged ? (
        <DateTimeFields
          legend={FORM_TEXT.end}
          value={form.end}
          onChange={(end) => set({ end })}
          nowLabel={FORM_TEXT.endNow}
          onNow={() => set({ end: dateTimeOf(new Date()) })}
        />
      ) : null}
      {kind === 'breastfeeding' ? (
        <FormField label={FORM_TEXT.side}>
          {(control) => <SelectInput {...control} placeholder={FORM_TEXT.sidePlaceholder} value={form.choice} options={sideOptions} onChange={(choice) => set({ choice })} />}
        </FormField>
      ) : null}
      {kind === 'diaper' ? (
        <FormField label={FORM_TEXT.diaper}>
          {(control) => <SelectInput {...control} placeholder={FORM_TEXT.diaperPlaceholder} value={form.choice} options={diaperOptions} onChange={(choice) => set({ choice })} />}
        </FormField>
      ) : null}
      {kind === 'bottle' ? (
        <FormField label={FORM_TEXT.amountMl} className="max-w-40">
          {(control) => <TextInput {...control} dir="ltr" value={form.amountMl} onChange={(event) => set({ amountMl: event.target.value })} />}
        </FormField>
      ) : null}
      {kind === 'medicine' || kind === 'vaccine' ? (
        <FormField label={kind === 'medicine' ? FORM_TEXT.medicineName : FORM_TEXT.vaccineName}>
          {(control) => <TextInput {...control} value={form.name} onChange={(event) => set({ name: event.target.value })} />}
        </FormField>
      ) : null}
      {kind === 'medicine' ? (
        <FormField label={FORM_TEXT.dosage}>
          {(control) => <TextInput {...control} value={form.dosage} onChange={(event) => set({ dosage: event.target.value })} />}
        </FormField>
      ) : null}
      {kind === 'growth' ? (
        <>
          <p className="text-small text-muted-foreground">{FORM_TEXT.growthHint}</p>
          <FormField label={FORM_TEXT.weight} className="max-w-40">
            {(control) => <TextInput {...control} dir="ltr" value={form.weightKg} onChange={(event) => set({ weightKg: event.target.value })} />}
          </FormField>
          <FormField label={FORM_TEXT.height} className="max-w-40">
            {(control) => <TextInput {...control} dir="ltr" value={form.heightCm} onChange={(event) => set({ heightCm: event.target.value })} />}
          </FormField>
          <FormField label={FORM_TEXT.head} className="max-w-40">
            {(control) => <TextInput {...control} dir="ltr" value={form.headCm} onChange={(event) => set({ headCm: event.target.value })} />}
          </FormField>
        </>
      ) : null}
      <FormField label={FORM_TEXT.note} optional>
        {(control) => <TextArea {...control} rows={2} value={form.note} onChange={(event) => set({ note: event.target.value })} />}
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>
          {editing ? FORM_TEXT.saveChanges : kind === 'bath' ? FORM_TEXT.bathDone : FORM_TEXT.save}
        </Button>
        {editing ? (
          <Button type="button" variant="text" onClick={onCancel}>
            {FORM_TEXT.cancelEdit}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
