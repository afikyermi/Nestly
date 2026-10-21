import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ProfessionalProfileFields,
  professionalFormErrors,
  type ProfessionalForm,
  type ProfessionalFormErrors,
} from '@/components/domain/professional-profile-fields';
import { AuthLayout } from '@/components/layout/auth-layout';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { CONTINUE, PERSONAL_REGISTER_LINK, PRO_STEP_INTRO, PRO_STEP_TITLE } from '@/lib/professional-texts';

export interface ProfessionalStepOneProps {
  form: ProfessionalForm;
  onFormChange: (form: ProfessionalForm) => void;
  /** Called when the form is valid. */
  onValid: () => void;
  /** Back to the personal registration (FR-REG-001). */
  onPersonal: () => void;
}

// A Professional's registration, step 1 (FR-PROREG-001): full name, business name, gender, field (a list, or "other" with a text), years of
// experience, and the directory's area and starting price. No business number and no verification (FR-PROREG-003 cancelled, OP-005).
// Errors appear on the first "המשך" and are recomputed on every change after it.
export function ProfessionalStepOne({ form, onFormChange, onValid, onPersonal }: ProfessionalStepOneProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const errors: ProfessionalFormErrors = submitted ? professionalFormErrors(form) : {};

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(professionalFormErrors(form)).length > 0) {
      setFocusTick((tick) => tick + 1);
      return;
    }
    onValid();
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit}>
      <AuthLayout
        back={
          <Button iconOnly label="חזרה" onClick={onPersonal}>
            <ArrowBackIcon />
          </Button>
        }
        actions={
          <>
            <Button type="submit" size="lg" block>
              {CONTINUE}
            </Button>
            <Button variant="text" onClick={onPersonal} className="self-center">
              {PERSONAL_REGISTER_LINK}
            </Button>
          </>
        }
      >
        <StepIndicator current={1} total={2} />
        <h1 className="mt-4 mb-1 text-h1">{PRO_STEP_TITLE}</h1>
        <p className="mb-5 text-body text-muted-foreground">{PRO_STEP_INTRO}</p>
        <ProfessionalProfileFields form={form} errors={errors} onChange={onFormChange} />
      </AuthLayout>
    </form>
  );
}
