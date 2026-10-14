import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLinkClickHandler } from 'react-router';
import { PARENT_GENDERS, type ParentGender, type RegistrationStep1 } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { ChoiceCardGroup, type ChoiceOption } from '@/components/shared/choice-card-group';
import { DateInput } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { ChildrenSection } from './ChildrenSection';
import { FieldError, FieldHint } from './field-message';
import { EMPTY_CHILD, validateStep1, type Step1Form } from './step1-form';

const STAGE_OPTIONS: ChoiceOption[] = [
  { value: 'planning', label: 'מתכננים' },
  { value: 'pregnant', label: 'בהריון' },
  { value: 'has_child', label: 'יש לנו ילד או ילדה' },
];

// VAL-039: planning and pregnant are never chosen together.
const EXCLUSIVE_STAGES = [['planning', 'pregnant']] as const;

const GENDER_LABELS: Record<ParentGender, string> = {
  woman: 'אישה',
  man: 'גבר',
  other: 'אחר',
  prefer_not_to_say: 'מעדיפים לא לציין',
};
const GENDER_OPTIONS = PARENT_GENDERS.map((value) => ({ value, label: GENDER_LABELS[value] }));

export interface RegisterStepOneProps {
  form: Step1Form;
  onFormChange: (form: Step1Form) => void;
  /** The device's local date, YYYY-MM-DD (Q6), read when "המשך" is pressed. */
  getToday: () => string;
  /** Called with the parsed value when the form is valid. */
  onValid: (value: RegistrationStep1) => void;
  /** Show the errors from the first render, as after a pressed "המשך" (stories). */
  showErrors?: boolean;
}

// Registration step 1 (FR-REG-002): stage, name, parent gender and, under "בהריון", a due date. Errors appear on the
// first "המשך" and are recomputed on every change after it, so one clears as soon as its field is valid.
export function RegisterStepOne({ form, onFormChange, getToday, onValid, showErrors }: RegisterStepOneProps) {
  const toWelcome = useLinkClickHandler(PATHS.welcome);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempts, setAttempts] = useState(showErrors === true ? 1 : 0);
  const ids = useId();
  const stageHintId = `${ids}-stage-hint`;
  const stageErrorId = `${ids}-stage-error`;
  const dueErrorId = `${ids}-due-error`;

  const checked = attempts > 0 ? validateStep1(form, getToday()) : null;
  const errors = checked !== null && !checked.ok ? checked.errors : {};

  // After a failed "המשך", focus goes to the first invalid control in document order.
  useEffect(() => {
    if (attempts === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempts]);

  // Ticking "יש לנו ילד או ילדה" opens one empty child card; children already entered return as they were (Q3).
  function onStagesChange(stages: string[]) {
    const needsCard = stages.includes('has_child') && form.children.length === 0;
    onFormChange({ ...form, stages, children: needsCard ? [EMPTY_CHILD] : form.children });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateStep1(form, getToday());
    if (result.ok) onValid(result.value);
    else setAttempts((count) => count + 1);
  }

  const pregnant = form.stages.includes('pregnant');
  const hasChild = form.stages.includes('has_child');
  const stageDescribedBy = [stageHintId, errors.stages !== undefined ? stageErrorId : null].filter(Boolean).join(' ');

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit}>
      <AuthLayout
        back={
          <Button iconOnly label="חזרה" href={PATHS.welcome} onClick={toWelcome}>
            <ArrowBackIcon />
          </Button>
        }
        actions={
          <Button type="submit" size="lg" block>
            המשך
          </Button>
        }
      >
        <StepIndicator current={1} total={2} />
        <h1 className="mt-4 mb-1 text-h1">פרטים אישיים</h1>
        <p className="mb-5 text-body text-muted-foreground">כדי שהתוכן יתאים למסע.</p>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <ChoiceCardGroup
              multiple
              legend="השלב במסע"
              name="stage"
              options={STAGE_OPTIONS}
              values={form.stages}
              exclusivePairs={EXCLUSIVE_STAGES}
              error={errors.stages !== undefined}
              aria-describedby={stageDescribedBy}
              onChange={onStagesChange}
            />
            <FieldHint id={stageHintId}>אפשר לבחור יותר מאפשרות אחת.</FieldHint>
            {errors.stages !== undefined ? <FieldError id={stageErrorId}>{errors.stages}</FieldError> : null}
          </div>
          {pregnant ? (
            <div className="flex flex-col gap-1.5">
              <DateInput
                legend="תאריך לידה משוער (לא חובה)"
                value={form.dueDate}
                error={errors.dueDate !== undefined}
                aria-describedby={errors.dueDate !== undefined ? dueErrorId : undefined}
                onChange={(dueDate) => onFormChange({ ...form, dueDate })}
              />
              {errors.dueDate !== undefined ? <FieldError id={dueErrorId}>{errors.dueDate}</FieldError> : null}
            </div>
          ) : null}
          {hasChild ? (
            <ChildrenSection
              children={form.children}
              errors={errors.child}
              onChange={(children) => onFormChange({ ...form, children })}
            />
          ) : null}
          <FormField label="שם מלא" {...(errors.fullName !== undefined ? { error: errors.fullName } : {})}>
            {(control) => (
              <TextInput
                {...control}
                autoComplete="name"
                value={form.fullName}
                onChange={(event) => onFormChange({ ...form, fullName: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="מין ההורה" optional {...(errors.parentGender !== undefined ? { error: errors.parentGender } : {})}>
            {(control) => (
              <SelectInput
                {...control}
                placeholder="בחירה"
                options={GENDER_OPTIONS}
                value={form.parentGender ?? ''}
                onChange={(parentGender) => onFormChange({ ...form, parentGender })}
              />
            )}
          </FormField>
        </div>
      </AuthLayout>
    </form>
  );
}
