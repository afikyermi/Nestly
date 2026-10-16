import { AuthLayout } from '@/components/layout/auth-layout';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { RETRY_TEXT } from './step2-form';

export interface GoogleLookupHoldProps {
  lookup: { status: 'pending' } | { status: 'failed'; onRetry: () => void };
  onBack: () => void;
}

// Step 2 of the completion waits here until Auth has said whether the user came in through Google (F1.8): the step differs (a
// password or none), so it is never guessed. A failed answer offers a retry.
export function GoogleLookupHold({ lookup, onBack }: GoogleLookupHoldProps) {
  return (
    <AuthLayout
      back={
        <Button iconOnly label="חזרה" onClick={onBack}>
          <ArrowBackIcon />
        </Button>
      }
    >
      <h1 className="mb-5 text-h1">השלמת ההרשמה</h1>
      {lookup.status === 'failed' ? (
        <div className="flex flex-col items-start gap-2">
          <InlineAlert>{RETRY_TEXT}</InlineAlert>
          <Button variant="soft" onClick={lookup.onRetry}>
            ניסיון חוזר
          </Button>
        </div>
      ) : (
        <p role="status" className="text-body text-muted-foreground">
          רגע אחד
        </p>
      )}
    </AuthLayout>
  );
}
