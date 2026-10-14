import type { RegistrationStep1 } from '@nestly/shared';
import { AuthLayout } from '@/components/layout/auth-layout';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';

export interface RegisterStepTwoProps {
  /** The parsed step-1 value, in memory only. F1.4 sends it with the account; this placeholder shows none of it. */
  step1: RegistrationStep1;
  onBack: () => void;
}

// Step 2 of registration, not built yet (F1.4): the heading, one line and a way back.
export function RegisterStepTwo({ onBack }: RegisterStepTwoProps) {
  return (
    <AuthLayout
      back={
        <Button iconOnly label="חזרה" onClick={onBack}>
          <ArrowBackIcon />
        </Button>
      }
    >
      <StepIndicator current={2} total={2} />
      <h1 className="mt-4 mb-2 text-h1">פרטי התחברות</h1>
      <p className="text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p>
    </AuthLayout>
  );
}
