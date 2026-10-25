import { useId, useState } from 'react';
import type { EnforceRequest, EnforcementKind, PermissionKey, TargetUser } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { TextArea } from '@/components/ui/text-area';
import { formatAdminTime } from './admin-format';
import {
  ACCOUNT_TYPE_LABELS,
  ACTION_FIELD_LABEL,
  ACTION_PLACEHOLDER,
  CHILD_SAFETY_LABEL,
  DURATION_FIELD_LABEL,
  DURATION_OPTIONS,
  ENFORCE_SUBMIT_LABEL,
  ENFORCEMENT_HEADING,
  HISTORY_EMPTY_TEXT,
  HISTORY_HEADING,
  CONTENT_HISTORY_HEADING,
  CONTENT_KIND_LABELS,
  KIND_ACTION_LABELS,
  PICK_ACTION_TEXT,
  REASON_LABEL,
  REASON_REQUIRED_TEXT,
  SKIPPED_TEXT,
  STATUS_LABELS,
  suggestionText,
  suspendedUntilText,
} from './admin-texts';

export interface EnforcementPanelProps {
  user: TargetUser;
  permissions: readonly PermissionKey[];
  /** The report this action comes from, and whether its reason is "content endangering a child" (the immediate-ban option). */
  report?: { id: string; isChildSafety: boolean };
  pending: boolean;
  /** Why the last action failed, or null. */
  failure: string | null;
  onSubmit: (request: Omit<EnforceRequest, 'userId'>) => void;
}

const NEEDS: Record<EnforcementKind, PermissionKey> = {
  warning: 'USER_WARN',
  suspension: 'USER_SUSPEND',
  reinstate: 'USER_SUSPEND',
  ban: 'USER_BAN',
  unban: 'USER_BAN',
};

/** The actions that fit the account's state and the keys held: a suspension can be ended, a ban lifted, nothing else reverses. */
function availableKinds(user: TargetUser, permissions: readonly PermissionKey[]): EnforcementKind[] {
  // An account scheduled for deletion can only be warned (the database refuses a suspension or a ban of it, I9).
  const kinds: EnforcementKind[] = user.status === 'banned' ? ['unban'] : user.status === 'suspended' ? ['warning', 'suspension', 'reinstate', 'ban'] : user.status === 'deletion_scheduled' ? ['warning'] : ['warning', 'suspension', 'ban'];
  return kinds.filter((kind) => permissions.includes(NEEDS[kind]));
}

// One account's status, its history and the next step of the ladder (BR-074), and the form for the Actor's decision (FR-MOD-002). The system suggests; the
// Actor always decides, may skip a step, and always gives a reason, which goes to the Audit Log. Which action the database allows is the Permission Key.
export function EnforcementPanel({ user, permissions, report, pending, failure, onSubmit }: EnforcementPanelProps) {
  const id = useId();
  const kinds = availableKinds(user, permissions);
  const [kind, setKind] = useState<string>('');
  const [hours, setHours] = useState<string>(DURATION_OPTIONS[0]?.value ?? '24');
  const [reason, setReason] = useState('');
  const [childSafety, setChildSafety] = useState(false);
  const [problem, setProblem] = useState<{ field: 'kind' | 'reason'; text: string } | null>(null);

  const chosen = kinds.find((candidate) => candidate === kind);
  function submit() {
    if (pending) return;
    if (chosen === undefined) {
      setProblem({ field: 'kind', text: PICK_ACTION_TEXT });
      return;
    }
    if (reason.trim() === '') {
      setProblem({ field: 'reason', text: REASON_REQUIRED_TEXT });
      return;
    }
    setProblem(null);
    onSubmit({
      kind: chosen,
      reason: reason.trim(),
      ...(chosen === 'suspension' ? { durationHours: Number(hours) } : {}),
      ...(report === undefined ? {} : { reportId: report.id }),
      ...(chosen === 'ban' && childSafety ? { childSafety: true } : {}),
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 id={`${id}-h`} className="text-h3">
        {ENFORCEMENT_HEADING}
      </h3>
      <p>
        {user.fullName ?? ACCOUNT_TYPE_LABELS[user.accountType]} · {STATUS_LABELS[user.status]}
        {user.status === 'suspended' && user.suspendedUntil !== null ? ` · ${suspendedUntilText(formatAdminTime(user.suspendedUntil))}` : ''}
      </p>
      <p className="text-muted-foreground">{suggestionText(user.suggestion.kind, user.suggestion.hours)}</p>
      <div>
        <h4 className="text-label">{HISTORY_HEADING}</h4>
        {user.history.length === 0 ? (
          <p className="text-muted-foreground">{HISTORY_EMPTY_TEXT}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-small">
            {user.history.map((row, index) => (
              <li key={`${row.createdAt}-${index}`}>
                {formatAdminTime(row.createdAt)} · {KIND_ACTION_LABELS[row.kind]}
                {row.stepSkipped ? ` · ${SKIPPED_TEXT}` : ''} · {row.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {user.contentDecisions === undefined || user.contentDecisions.length === 0 ? null : (
        // I14 completion B (FR-MOD-002, PG-028, Afik 21.10.2026): the content of this account that justified reports deleted
        <div>
          <h4 className="text-label">{CONTENT_HISTORY_HEADING}</h4>
          <ul className="mt-1 flex flex-col gap-1 text-small" aria-label={CONTENT_HISTORY_HEADING}>
            {user.contentDecisions.map((row, index) => (
              <li key={`${row.decidedAt}-${index}`}>
                {formatAdminTime(row.decidedAt)} · {CONTENT_KIND_LABELS[row.targetKind]} · {row.ruleLabel} ·{' '}
                <span dir="auto">{row.excerpt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {kinds.length === 0 ? null : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormField label={ACTION_FIELD_LABEL} {...(problem?.field === 'kind' ? { error: problem.text } : {})}>
            {(control) => (
              <SelectInput
                {...control}
                placeholder={ACTION_PLACEHOLDER}
                value={kind}
                options={kinds.map((candidate) => ({ value: candidate, label: KIND_ACTION_LABELS[candidate] }))}
                onChange={setKind}
              />
            )}
          </FormField>
          {chosen === 'suspension' ? (
            <FormField label={DURATION_FIELD_LABEL}>
              {(control) => <SelectInput {...control} placeholder={DURATION_FIELD_LABEL} value={hours} options={DURATION_OPTIONS} onChange={setHours} />}
            </FormField>
          ) : null}
          <FormField label={REASON_LABEL} {...(problem?.field === 'reason' ? { error: problem.text } : {})}>
            {(control) => <TextArea {...control} rows={3} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />}
          </FormField>
          {chosen === 'ban' && report?.isChildSafety === true ? (
            <Checkbox checked={childSafety} onCheckedChange={setChildSafety}>
              {CHILD_SAFETY_LABEL}
            </Checkbox>
          ) : null}
          {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
          <div>
            <Button type="submit" pending={pending}>
              {ENFORCE_SUBMIT_LABEL}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
