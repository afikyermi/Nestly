import { FieldError } from '@/components/shared/field-message';
import { Checkbox } from '@/components/ui/checkbox';
import { QUALIFICATION_DECLARATION, QUALIFICATION_REQUIRED } from '@/lib/professional-texts';

export interface QualificationFieldProps {
  checked: boolean;
  /** Shows the error: the checkbox is invalid and the message is linked to it. */
  error: boolean;
  /** The id of the error message. */
  errorId: string;
  onCheckedChange: (checked: boolean) => void;
}

// A Professional's required declaration (Afik 21.10.2026): it holds the training and licence its chosen field needs. The fields stay as they
// are and nothing is verified (FR-PROREG-003 cancelled); the responsibility is the Professional's, as the terms of use say.
export function QualificationField({ checked, error, errorId, onCheckedChange }: QualificationFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Checkbox checked={checked} error={error} aria-describedby={error ? errorId : undefined} onCheckedChange={onCheckedChange}>
        {QUALIFICATION_DECLARATION}
      </Checkbox>
      {error ? <FieldError id={errorId}>{QUALIFICATION_REQUIRED}</FieldError> : null}
    </div>
  );
}
