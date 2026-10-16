import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { localDateIso, type RegistrationStep1 } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { documentTitle } from '@/lib/document-title';
import { RegisterConsentStep } from './RegisterConsentStep';
import { RegisterGoogleCompletionStep } from './RegisterGoogleCompletionStep';
import { RegisterStepOne } from './RegisterStepOne';
import { GoogleLookupHold } from './GoogleLookupHold';
import { RegisterStepTwo } from './RegisterStepTwo';
import { EMPTY_STEP1_FORM, type Step1Form } from './step1-form';

/** Whether the completing user came in through Google (F1.8): asked of Auth by the page. Absent reads as 'none'. */
export type GoogleLookup =
  | { status: 'pending' }
  | { status: 'failed'; onRetry: () => void }
  | { status: 'none' }
  | { status: 'google'; email: string };

export interface RegistrationFlowProps {
  /** The calendar date used to judge dates, YYYY-MM-DD. Default: the device's local date when "המשך" is pressed (Q6). */
  today?: string;
  /** Completion mode (F1.5, DR-2): the user signed in but never created the account. Step 2 becomes the consent alone; for a Google user (F1.8) it is the password and the consent. */
  completion?: { onSignOut: () => void; onUnauthenticated: () => void; google?: GoogleLookup };
}

// Step 2 is a second history entry on the same URL, marked by this state: the browser Back button returns to step 1.
const STEP_TWO_STATE = { registrationStep: 2 } as const;

function isStepTwoEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && Reflect.get(state, 'registrationStep') === 2;
}

// The registration flow (UC-01): owns step-1 data in React state of this tab only (Q1). Nothing is stored; step 2 sends it; leaving
// /register or reloading discards it. Step 2 shows only while the parsed value is in memory, so a reload or a browser
// Forward onto a step-2 entry lands on an empty step 1.
export function RegistrationFlow({ today, completion }: RegistrationFlowProps) {
  const [form, setForm] = useState<Step1Form>(EMPTY_STEP1_FORM);
  const [parsed, setParsed] = useState<RegistrationStep1 | null>(null);
  // Kept here so it survives Back and a return to step 2; the password is step 2's own and does not (F1.4 criterion 19).
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const stepTwoValue = isStepTwoEntry(location.state) ? parsed : null;

  return (
    <main tabIndex={-1}>
      <title>{documentTitle(completion !== undefined ? 'השלמת ההרשמה' : stepTwoValue !== null ? 'פרטי התחברות' : 'פרטים אישיים')}</title>
      {stepTwoValue !== null && (completion?.google?.status === 'pending' || completion?.google?.status === 'failed') ? (
        <GoogleLookupHold lookup={completion.google} onBack={() => void navigate(-1)} />
      ) : stepTwoValue !== null && completion?.google?.status === 'google' ? (
        <RegisterGoogleCompletionStep
          step1={stepTwoValue}
          email={completion.google.email}
          onBack={() => void navigate(-1)}
          onSignOut={completion.onSignOut}
          onUnauthenticated={completion.onUnauthenticated}
        />
      ) : stepTwoValue !== null && completion !== undefined ? (
        <RegisterConsentStep
          step1={stepTwoValue}
          onBack={() => void navigate(-1)}
          onSignOut={completion.onSignOut}
          onUnauthenticated={completion.onUnauthenticated}
        />
      ) : stepTwoValue !== null ? (
        <RegisterStepTwo step1={stepTwoValue} email={email} onEmailChange={setEmail} onBack={() => void navigate(-1)} />
      ) : (
        <RegisterStepOne
          form={form}
          onFormChange={(next) => {
            // A changed form is a new parse: step 2 never shows a value from before the change.
            setForm(next);
            setParsed(null);
          }}
          {...(completion !== undefined ? { completion: { onSignOut: completion.onSignOut } } : {})}
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
