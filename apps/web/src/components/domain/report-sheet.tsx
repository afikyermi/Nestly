import { useEffect, useId, useRef } from 'react';
import { codePointLength, REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason, type ReportTargetKind } from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { FieldError } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import {
  DETAILS_HINT,
  DETAILS_INVALID_TEXT,
  DETAILS_LABEL,
  DETAILS_TOO_LONG_TEXT,
  detailsRemainingText,
  NEW_TAB_NOTE,
  OTHER_DETAILS_REQUIRED_TEXT,
  REASON_LABELS,
  REASON_REQUIRED_TEXT,
  REASONS_LEGEND,
  REPORT_CANCEL_LABEL,
  REPORT_INTRO,
  REPORT_TITLES,
  RULES_LINK_LABEL,
  SEND_REPORT_LABEL,
  SENDING_REPORT_TEXT,
  SPAM_HINT,
} from '@/lib/report-texts';

/** The counter speaks only at this many characters left or fewer. */
const COUNTER_FROM = 100;

/** The built-in list, used until (or when) the community's current list cannot be read. */
const DEFAULT_REASONS: ReadonlyArray<{ key: ReportReason; label: string }> = REPORT_REASONS.map((reason) => ({ key: reason, label: REASON_LABELS[reason] }));
const optionsOf = (reasons: ReadonlyArray<{ key: ReportReason; label: string }>) =>
  reasons.map(({ key, label }) => ({ value: key, label, ...(key === 'spam' ? { description: SPAM_HINT } : {}) }));

export interface ReportSheetProps {
  /** What is reported: the window's name. */
  targetKind: ReportTargetKind;
  /** The reasons a reporter may choose now, in their order (FR-ADMIN-007); the built-in list when absent. */
  reasons?: ReadonlyArray<{ key: ReportReason; label: string }> | undefined;
  reason: ReportReason | null;
  details: string;
  errors: { reason?: 'required'; details?: 'required' | 'long' | 'invalid' };
  sending: boolean;
  /** Why the last send failed (ERR-004 or the session's text), shown in the window as an alert. */
  failure: string | null;
  /** The field focus goes to after a refused send, once per tick (0: none). */
  focus: { field: 'reason' | 'details'; tick: number };
  /** The community rules page; it opens in a new tab, so what was written here stays. */
  rulesHref: string;
  onReasonChange: (reason: ReportReason) => void;
  onDetailsChange: (text: string) => void;
  onSend: () => void;
  /** ביטול, Escape, a press outside: the caller closes the window (or keeps it while `sending`). */
  onCancel: () => void;
  /** Where focus goes when it closes; unset or null: back to the element that opened it. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

const detailsMessage = (error: ReportSheetProps['errors']['details']): string | undefined =>
  error === 'required' ? OTHER_DETAILS_REQUIRED_TEXT : error === 'long' ? DETAILS_TOO_LONG_TEXT : error === 'invalid' ? DETAILS_INVALID_TEXT : undefined;

// The report window (F3.7 c10-c12; FR-MOD-001, AC-106) on the shared sheet: the target's name, who sees a report, the eight reasons in
// FR-MOD-001's order with none chosen, an optional text with its counter, the community rules link, send and cancel. Display only: what
// sending does comes in as props. Focus starts on the first reason and stays inside; the text is the person's own, so it takes its own
// direction and nothing in it is markup.
export function ReportSheet(props: ReportSheetProps) {
  const { targetKind, reasons = DEFAULT_REASONS, reason, details, errors, sending, failure, focus, rulesHref, onReasonChange, onDetailsChange, onSend, onCancel, finalFocus } = props;
  const shown = reasons.length > 0 ? reasons : DEFAULT_REASONS;
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const reasonErrorId = `${ids}-reason-error`;
  const left = REPORT_DETAILS_MAX - codePointLength(details.trim());

  useEffect(() => {
    if (focus.tick === 0) return;
    const selector = focus.field === 'reason' ? 'input[type="radio"]' : 'textarea';
    formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [focus]);

  return (
    <SheetPanel
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      onOpened={(panel) => panel.querySelector<HTMLElement>('input[type="radio"]')?.focus()}
      finalFocus={finalFocus}
    >
      <SheetTitle>{REPORT_TITLES[targetKind]}</SheetTitle>
      <SheetDescription>{REPORT_INTRO}</SheetDescription>
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending) onSend();
        }}
      >
        {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
        <div className="flex flex-col gap-1.5">
          <ChoiceCardGroup
            legend={REASONS_LEGEND}
            name={`${ids}-reason`}
            options={optionsOf(shown)}
            value={reason}
            error={errors.reason !== undefined}
            aria-describedby={errors.reason !== undefined ? reasonErrorId : undefined}
            onChange={(value) => {
              const chosen = shown.find((item) => item.key === value);
              if (chosen !== undefined) onReasonChange(chosen.key);
            }}
          />
          {errors.reason !== undefined ? <FieldError id={reasonErrorId}>{REASON_REQUIRED_TEXT}</FieldError> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <FormField label={DETAILS_LABEL} htmlFor={`${ids}-details`} hint={DETAILS_HINT} {...(errors.details === undefined ? {} : { error: detailsMessage(errors.details) ?? '' })}>
            {(control) => <TextArea {...control} dir="auto" rows={3} value={details} onChange={(event) => onDetailsChange(event.target.value)} />}
          </FormField>
          {/* The polite region is always mounted; it speaks only in the limit's last 100 characters. */}
          <p role="status" className="text-small text-muted-foreground empty:sr-only">
            {left <= COUNTER_FROM ? detailsRemainingText(left) : ''}
          </p>
        </div>
        <a
          href={rulesHref}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center self-start text-label text-primary-strong underline underline-offset-4"
        >
          {RULES_LINK_LABEL}
          <span className="sr-only"> {NEW_TAB_NOTE}</span>
        </a>
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" block pending={sending} aria-disabled={sending ? true : undefined}>
            {sending ? SENDING_REPORT_TEXT : SEND_REPORT_LABEL}
          </Button>
          <Button variant="text" className="self-center" aria-disabled={sending ? true : undefined} onClick={onCancel}>
            {REPORT_CANCEL_LABEL}
          </Button>
        </div>
      </form>
    </SheetPanel>
  );
}
