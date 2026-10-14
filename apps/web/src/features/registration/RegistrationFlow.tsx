import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { localDateIso, type RegistrationStep1 } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { documentTitle } from '@/lib/document-title';
import { RegisterStepOne } from './RegisterStepOne';
import { RegisterStepTwo } from './RegisterStepTwo';
import { EMPTY_STEP1_FORM, type Step1Form } from './step1-form';

export interface RegistrationFlowProps {
  /** The calendar date used to judge dates, YYYY-MM-DD. Default: the device's local date when "המשך" is pressed (Q6). */
  today?: string;
}

// Step 2 is a second history entry on the same URL, marked by this state: the browser Back button returns to step 1.
const STEP_TWO_STATE = { registrationStep: 2 } as const;

function isStepTwoEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && Reflect.get(state, 'registrationStep') === 2;
}

// The registration flow (UC-01): owns step-1 data in React state of this tab only (Q1). Nothing is stored; step 2 sends it; leaving
// /register or reloading discards it. Step 2 shows only while the parsed value is in memory, so a reload or a browser
// Forward onto a step-2 entry lands on an empty step 1.
export function RegistrationFlow({ today }: RegistrationFlowProps) {
  const [form, setForm] = useState<Step1Form>(EMPTY_STEP1_FORM);
  const [parsed, setParsed] = useState<RegistrationStep1 | null>(null);
  // Kept here so it survives Back and a return to step 2; the password is step 2's own and does not (F1.4 criterion 19).
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const stepTwoValue = isStepTwoEntry(location.state) ? parsed : null;

  return (
    <main tabIndex={-1}>
      <title>{documentTitle(stepTwoValue !== null ? 'פרטי התחברות' : 'פרטים אישיים')}</title>
      {stepTwoValue !== null ? (
        <RegisterStepTwo step1={stepTwoValue} email={email} onEmailChange={setEmail} onBack={() => void navigate(-1)} />
      ) : (
        <RegisterStepOne
          form={form}
          onFormChange={(next) => {
            // A changed form is a new parse: step 2 never shows a value from before the change.
            setForm(next);
            setParsed(null);
          }}
          getToday={() => today ?? localDateIso(new Date())}
          onValid={(value) => {
            setParsed(value);
            void navigate(PATHS.register, { state: STEP_TWO_STATE });
          }}
        />
      )}
    </main>
  );
}
