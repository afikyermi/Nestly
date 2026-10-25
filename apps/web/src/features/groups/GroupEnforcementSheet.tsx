import { useId, useState } from 'react';
import {
  GROUP_ENFORCEMENT_REASONS,
  GROUP_ENFORCEMENT_TEXT_MAX,
  GROUP_MUTE_HOURS,
  type GroupEnforcementBody,
  type GroupEnforcementReason,
  type GroupMuteHours,
} from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { FieldError } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import {
  BLOCK_DESCRIPTION,
  BLOCK_MEMBER,
  BLOCK_TITLE,
  CANCEL_LABEL,
  DURATION_LABEL,
  DURATION_LEGEND,
  REASON_LABEL,
  REASON_LEGEND,
  REASON_OTHER_HINT,
  REASON_OTHER_LABEL,
  REASON_OTHER_REQUIRED,
  REASON_REQUIRED,
  WARN_DESCRIPTION,
  WARN_SUBMIT,
  WARN_TITLE,
} from './groups-texts';

export interface GroupEnforcementSheetProps {
  /** The action and the member it names, or null when closed. */
  target: { kind: 'warn_mute' | 'remove_block'; userId: string; name: string } | null;
  pending: boolean;
  failure: string | null;
  onSubmit: (body: GroupEnforcementBody) => void;
  onClose: () => void;
}

const REASONS = GROUP_ENFORCEMENT_REASONS.map((value) => ({ value, label: REASON_LABEL[value] }));
const DURATIONS = GROUP_MUTE_HOURS.map((value) => ({ value: String(value), label: DURATION_LABEL[value] }));
const isReason = (value: string): value is GroupEnforcementReason => GROUP_ENFORCEMENT_REASONS.some((r) => r === value);
const isHours = (value: number): value is GroupMuteHours => GROUP_MUTE_HOURS.some((h) => h === value);

// The Group's enforcement window (§11.16; FR-GRP-003): warning + mute (a reason from the closed list, "other" with up to 500 characters, and
// 24 hours or 7 days) or removal + block (a reason). Only these two exist: there is no plain removal. The member gets the notice; the
// manager who acted is not named to them.
export function GroupEnforcementSheet({ target, pending, failure, onSubmit, onClose }: GroupEnforcementSheetProps) {
  const ids = useId();
  const [reason, setReason] = useState<GroupEnforcementReason | null>(null);
  const [text, setText] = useState('');
  const [hours, setHours] = useState<GroupMuteHours>(24);
  const [problem, setProblem] = useState<'reason' | 'text' | null>(null);
  const warn = target?.kind === 'warn_mute';

  function close() {
    if (pending) return;
    setReason(null);
    setText('');
    setHours(24);
    setProblem(null);
    onClose();
  }

  function submit() {
    if (target === null || pending) return;
    if (reason === null) return setProblem('reason');
    const trimmed = text.trim();
    if (reason === 'other' && (trimmed === '' || [...trimmed].length > GROUP_ENFORCEMENT_TEXT_MAX)) return setProblem('text');
    setProblem(null);
    onSubmit({
      userId: target.userId,
      kind: target.kind,
      reason,
      ...(reason === 'other' ? { reasonText: trimmed } : {}),
      ...(target.kind === 'warn_mute' ? { muteHours: hours } : {}),
    });
  }

  return (
    <SheetPanel open={target !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetTitle>{`${warn ? WARN_TITLE : BLOCK_TITLE}: ${target?.name ?? ''}`}</SheetTitle>
      <SheetDescription>{warn ? WARN_DESCRIPTION : BLOCK_DESCRIPTION}</SheetDescription>
      {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
      <ChoiceCardGroup
        legend={REASON_LEGEND}
        name={`${ids}-reason`}
        options={REASONS}
        value={reason}
        error={problem === 'reason'}
        {...(problem === 'reason' ? { 'aria-describedby': `${ids}-reason-error` } : {})}
        onChange={(value) => {
          if (isReason(value)) setReason(value);
          setProblem(null);
        }}
      />
      {problem === 'reason' ? <FieldError id={`${ids}-reason-error`}>{REASON_REQUIRED}</FieldError> : null}
      {reason === 'other' ? (
        <FormField label={REASON_OTHER_LABEL} hint={REASON_OTHER_HINT} {...(problem === 'text' ? { error: REASON_OTHER_REQUIRED } : {})}>
          {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
        </FormField>
      ) : null}
      {warn ? (
        <ChoiceCardGroup
          legend={DURATION_LEGEND}
          name={`${ids}-hours`}
          options={DURATIONS}
          value={String(hours)}
          onChange={(value) => {
            const n = Number(value);
            if (isHours(n)) setHours(n);
          }}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <Button variant="primary" pending={pending} onClick={submit}>
          {warn ? WARN_SUBMIT : BLOCK_MEMBER}
        </Button>
        <Button variant="text" onClick={close}>
          {CANCEL_LABEL}
        </Button>
      </div>
    </SheetPanel>
  );
}
