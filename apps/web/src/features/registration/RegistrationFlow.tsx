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
import { ProfessionalStepOne } from './ProfessionalStepOne';
import { EMPTY_PROFESSIONAL_FORM, professionalInputOf, type ProfessionalForm } from '@/components/domain/professional-profile-fields';
import type { RegisterOutcome } from '@/services/api/register-account';
import { registerProfessional } from '@/services/api/professionals';

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
  // I11 (FR-REG-001): which account this registration creates. A Professional's step 1 is its own form; step 2 is the same.
  const [kind, setKind] = useState<'personal' | 'professional'>('personal');
  const [proForm, setProForm] = useState<ProfessionalForm>(EMPTY_PROFESSIONAL_FORM);
  const [proReady, setProReady] = useState(false);
  // Afik 21.10.2026: the Professional's required qualification declaration (sent with the account)
  const [declared, setDeclared] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const stepTwoValue = isStepTwoEntry(location.state) && kind === 'personal' ? parsed : null;
  // I11 follow-ups (FR-REG-004, AC-100): a Professional's account can also be created from "complete registration" (a signed-in Auth user with no
  // account): its step 2 is then the consent alone (or, for a Google user, the password and the consent), as for a personal account.
  const proStepTwo = kind === 'professional' && proReady && declared && isStepTwoEntry(location.state);
  const submitProfessional = async (token: string): Promise<RegisterOutcome> => {
    const result = await registerProfessional(token, { ...professionalInputOf(proForm), consent: true, qualification: true });
    if (result.kind === 'ok') return 'created';
    if (result.kind === 'already-done') return 'already_registered';
    if (result.kind === 'unauthenticated') return 'unauthenticated';
    return 'failed';
  };

  return (
    <main tabIndex={-1}>
      <title>{documentTitle(completion !== undefined ? 'השלמת ההרשמה' : stepTwoValue !== null || proStepTwo ? 'פרטי התחברות' : kind === 'professional' ? 'פרטים מקצועיים' : 'פרטים אישיים')}</title>
      {proStepTwo && completion === undefined ? (
        <RegisterStepTwo step1={null} submitAccount={submitProfessional} email={email} onEmailChange={setEmail} onBack={() => void navigate(-1)} />
      ) : proStepTwo && (completion?.google?.status === 'pending' || completion?.google?.status === 'failed') ? (
        <GoogleLookupHold lookup={completion.google} onBack={() => void navigate(-1)} />
      ) : proStepTwo && completion?.google?.status === 'google' ? (
        <RegisterGoogleCompletionStep
          step1={null}
          submitAccount={submitProfessional}
          email={completion.google.email}
          onBack={() => void navigate(-1)}
          onSignOut={completion.onSignOut}
          onUnauthenticated={completion.onUnauthenticated}
        />
      ) : proStepTwo && completion !== undefined ? (
        <RegisterConsentStep
          step1={null}
          submitAccount={submitProfessional}
          onBack={() => void navigate(-1)}
          onSignOut={completion.onSignOut}
          onUnauthenticated={completion.onUnauthenticated}
        />
      ) : kind === 'professional' ? (
        <ProfessionalStepOne
          form={proForm}
          onFormChange={(next) => {
            setProForm(next);
            setProReady(false);
          }}
          declared={declared}
          onDeclaredChange={setDeclared}
          onPersonal={() => setKind('personal')}
          onValid={() => {
            setProReady(true);
            void navigate(PATHS.register, { state: STEP_TWO_STATE });
          }}
        />
      ) : stepTwoValue !== null && (completion?.google?.status === 'pending' || completion?.google?.status === 'failed') ? (
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
          onProfessional={() => setKind('professional')}
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
