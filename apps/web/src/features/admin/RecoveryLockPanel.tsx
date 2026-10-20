import { useId, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { RECOVERY_HEADING, RECOVERY_HINT, RECOVERY_NOTE_LABEL, RECOVERY_RELEASE_LABEL } from './admin-texts';

export interface RecoveryLockPanelProps {
  pending: boolean;
  /** Why the last release failed, or null. */
  failure: string | null;
  onRelease: (reason: string | undefined) => void;
}

// The Admin's release of an account's recovery lock (FR-ADMIN-013, PG-028): mostly for the permanent lock of the ladder (NFR-SEC-010), at the
// user's request. The release resets the count; it signs nobody in and changes no password. Who may release is the database's (the Admin's key).
export function RecoveryLockPanel({ pending, failure, onRelease }: RecoveryLockPanelProps) {
  const id = useId();
  const [note, setNote] = useState('');
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 id={`${id}-h`} className="text-h3">
        {RECOVERY_HEADING}
      </h3>
      <p className="text-small text-muted-foreground">{RECOVERY_HINT}</p>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <FormField label={RECOVERY_NOTE_LABEL}>{(control) => <TextArea {...control} value={note} onChange={(event) => setNote(event.target.value)} />}</FormField>
      <div>
        <Button
          variant="soft"
          pending={pending}
          onClick={() => {
            if (pending) return;
            onRelease(note.trim() === '' ? undefined : note.trim());
          }}
        >
          {RECOVERY_RELEASE_LABEL}
        </Button>
      </div>
    </section>
  );
}
