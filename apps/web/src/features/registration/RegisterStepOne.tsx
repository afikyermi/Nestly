import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLinkClickHandler } from 'react-router';
import { JOURNEY_STAGES, type RegistrationStep1 } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { ChoiceCardGroup, type ChoiceOption } from '@/components/shared/choice-card-group';
import { DateInput } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { GoogleButton } from '@/components/shared/google-button';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';
import { DUE_DATE_OPTIONAL_LABEL, STAGE_LABELS } from '@/lib/child-fields';
import { GENDER_OPTIONS } from '@/lib/profile-fields';
import { ChildrenSection } from './ChildrenSection';
import { FieldError, FieldHint } from '@/components/shared/field-message';
import { EMPTY_CHILD, validateStep1, type ChildForm, type Step1Errors, type Step1Form } from './step1-form';

const STAGE_OPTIONS: ChoiceOption[] = JOURNEY_STAGES.map((value) => ({ value, label: STAGE_LABELS[value] }));

// VAL-039: planning and pregnant are never chosen together.
const EXCLUSIVE_STAGES = [['planning', 'pregnant']] as const;

function withoutFreshCards(errors: Step1Errors, children: readonly ChildForm[], fresh: WeakSet<ChildForm>): Step1Errors {
  if (errors.child === undefined) return errors;
  const child = Object.fromEntries(Object.entries(errors.child).filter(([index]) => {
    const card = children[Number(index)];
    return card === undefined || !fresh.has(card);
  }));
  return { ...errors, child };
}

export interface RegisterStepOneProps {
  form: Step1Form;
  onFormChange: (form: Step1Form) => void;
  /** The device's local date, YYYY-MM-DD (Q6), read when "המשך" is pressed. */
  getToday: () => string;
  /** Called with the parsed value when the form is valid. */
  onValid: (value: RegistrationStep1) => void;
  /** Completion mode (F1.5): the user is signed in without an account. Own heading and text, and "התנתקות" instead of the way back. */
  completion?: { onSignOut: () => void };
}

// Registration step 1 (FR-REG-002): stage, name, parent gender and, under "בהריון", a due date. Errors appear on the
// first "המשך" and are recomputed on every change after it, so one clears as soon as its field is valid.
export function RegisterStepOne({ form, onFormChange, getToday, onValid, completion }: RegisterStepOneProps) {
  const toWelcome = useLinkClickHandler(PATHS.welcome);
  const google = useGoogleSignIn();
  const formRef = useRef<HTMLFormElement>(null);
  const [attempts, setAttempts] = useState(0);
  const ids = useId();
  const stageHintId = `${ids}-stage-hint`;
  const stageErrorId = `${ids}-stage-error`;
  const dueErrorId = `${ids}-due-error`;

  const checked = attempts > 0 ? validateStep1(form, getToday()) : null;
  // A card added after the last failed "המשך" shows no errors until the user touches it (editing replaces the object, so it
  // leaves this set); clearing stays live.
  const freshCards = useRef(new WeakSet<ChildForm>());
  const errors = checked !== null && !checked.ok ? withoutFreshCards(checked.errors, form.children, freshCards.current) : {};

  // After a failed "המשך", focus goes to the first invalid control in document order.
  useEffect(() => {
    if (attempts === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempts]);

  // Ticking "יש לנו ילד או ילדה" opens one empty child card; children already entered return as they were (Q3).
  function onStagesChange(stages: string[]) {
    const needsCard = stages.includes('has_child') && form.children.length === 0;
    const card = { ...EMPTY_CHILD };
    if (needsCard && attempts > 0) freshCards.current.add(card);
    onFormChange({ ...form, stages, children: needsCard ? [card] : form.children });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateStep1(form, getToday());
    if (result.ok) onValid(result.value);
    else {
      freshCards.current = new WeakSet();
      setAttempts((count) => count + 1);
    }
  }

  const pregnant = form.stages.includes('pregnant');
  const hasChild = form.stages.includes('has_child');
  const stageDescribedBy = [stageHintId, errors.stages !== undefined ? stageErrorId : null].filter(Boolean).join(' ');

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit}>
      <AuthLayout
        {...(completion === undefined
          ? {
              back: (
                <Button iconOnly label="חזרה" href={PATHS.welcome} onClick={toWelcome}>
                  <ArrowBackIcon />
                </Button>
              ),
            }
          : {})}
        actions={
          <>
            <Button type="submit" size="lg" block>
              המשך
            </Button>
            {completion === undefined ? (
              <GoogleButton busy={google.busy} message={google.message} onPress={google.onPress} buttonRef={google.buttonRef} />
            ) : null}
            {completion !== undefined ? (
              <Button variant="text" onClick={completion.onSignOut} className="self-center">
                התנתקות
              </Button>
            ) : null}
          </>
        }
      >
        <StepIndicator current={1} total={2} />
        <h1 className="mt-4 mb-1 text-h1">{completion !== undefined ? 'השלמת ההרשמה' : 'פרטים אישיים'}</h1>
        <p className="mb-5 text-body text-muted-foreground">
          {completion !== undefined ? 'ההרשמה הקודמת לא הסתיימה. עוד רגע מסיימים.' : 'כדי שהתוכן יתאים למסע.'}
        </p>
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
                legend={DUE_DATE_OPTIONAL_LABEL}
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
              onChange={(children) => {
                const added = children.length > form.children.length ? children[children.length - 1] : undefined;
                if (added !== undefined && attempts > 0) freshCards.current.add(added);
                onFormChange({ ...form, children });
              }}
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
