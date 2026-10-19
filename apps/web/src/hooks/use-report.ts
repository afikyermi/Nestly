import { useCallback, useRef, useState } from 'react';
import { checkCreateReport, reportDetailsProblem, type ReportReason, type ReportTargetKind } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { REPORT_FAILED_TEXT } from '@/lib/report-texts';
import { fileReport, type ReportRequest } from '@/services/api/reports';
import type { ReportSheetProps } from '@/components/domain/report-sheet';

/** What is reported: a post, a comment (or reply) or another person's account, by its id. */
export interface ReportTarget {
  kind: ReportTargetKind;
  id: string;
}

/** What is wrong with the form: no reason chosen; the text is missing for "אחר", too long, or holds a character that cannot be stored. */
export interface ReportErrors {
  reason?: 'required';
  details?: 'required' | 'long' | 'invalid';
}

/** The open report window: the target, what was chosen and written, the check's result, and the request. */
export interface ReportDraft {
  target: ReportTarget;
  reason: ReportReason | null;
  details: string;
  errors: ReportErrors;
  /** After a first refused send, the form is checked again on every change. */
  validating: boolean;
  sending: boolean;
  /** Why the last send failed (network, 5xx, a refused session): the window stays, with what was written. */
  failure: string | null;
  /** The field focus goes to, once per tick, after a refused send. */
  focus: { field: 'reason' | 'details'; tick: number };
}

/** What a send that went through ended with; the window is already closed. */
export type ReportResult = 'received' | 'already-reported' | 'unavailable';

export interface ReportFlow {
  draft: ReportDraft | null;
  /** Opens the window for a target, empty: nothing chosen, nothing written. */
  start: (target: ReportTarget) => void;
  chooseReason: (reason: ReportReason) => void;
  changeDetails: (text: string) => void;
  /** Checks the form by the shared rule and sends one request; a second press while it is in flight sends nothing. */
  send: () => void;
  /** Closes the window with no request (ביטול, Escape, a press outside, Back). Not while the request is in flight. */
  cancel: () => void;
}

function errorsOf(reason: ReportReason | null, details: string): ReportErrors {
  const problem = reportDetailsProblem(details);
  const missing = reason === 'other' && details.trim() === '';
  return {
    ...(reason === null ? { reason: 'required' as const } : {}),
    ...(problem !== null ? { details: problem } : missing ? { details: 'required' as const } : {}),
  };
}

const hasErrors = (errors: ReportErrors): boolean => errors.reason !== undefined || errors.details !== undefined;

// The report window's flow (F3.7; FR-MOD-001): one window at a time, the choice and the text, the check (the same shared rule the server
// applies) and one POST. Nothing is sent but the target, the reason and the text; the server decides who may report what. Every answer the
// server gave closes the window and is handed to `onDone`; a request that did not get one keeps it open with what was written. A refused
// token (401) or a stopped account (403) asks the session for the account state again (ERR-038, ERR-037).
export function useReport(onDone: (target: ReportTarget, result: ReportResult) => void): ReportFlow {
  const account = useSessionAccount();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const busy = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const latest = useRef(draft);
  latest.current = draft;

  const start = useCallback((target: ReportTarget) => {
    if (busy.current) return;
    setDraft({ target, reason: null, details: '', errors: {}, validating: false, sending: false, failure: null, focus: { field: 'reason', tick: 0 } });
  }, []);

  const change = useCallback((reason: ReportReason | null, details: string) => {
    setDraft((now) => (now === null ? null : { ...now, reason, details, errors: now.validating ? errorsOf(reason, details) : {} }));
  }, []);

  const send = useCallback(async () => {
    const now = latest.current;
    if (now === null || busy.current) return;
    const errors = errorsOf(now.reason, now.details);
    if (now.reason === null || hasErrors(errors)) {
      const field = errors.reason !== undefined ? 'reason' : 'details';
      setDraft({ ...now, errors, validating: true, failure: null, focus: { field, tick: now.focus.tick + 1 } });
      return;
    }
    const request: ReportRequest = {
      targetKind: now.target.kind,
      targetId: now.target.id,
      reason: now.reason,
      ...(now.details.trim() === '' ? {} : { details: now.details }),
    };
    // The same rule the server applies; the fields above already passed it, so a refusal here is a target id that is not one.
    if (!checkCreateReport(request).ok) {
      setDraft({ ...now, failure: REPORT_FAILED_TEXT });
      return;
    }
    busy.current = true;
    setDraft({ ...now, errors: {}, failure: null, sending: true });
    try {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await fileReport(token, request);
      if (outcome.kind === 'received' || outcome.kind === 'already-reported' || outcome.kind === 'unavailable') {
        setDraft(null);
        done.current(now.target, outcome.kind);
        return;
      }
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      const failure = outcome.kind === 'account-unavailable' ? STOPPED_TEXT : REPORT_FAILED_TEXT;
      setDraft((current) => (current === null ? null : { ...current, sending: false, failure }));
    } finally {
      busy.current = false;
    }
  }, [account]);

  return {
    draft,
    start,
    chooseReason: (reason) => change(reason, latest.current?.details ?? ''),
    changeDetails: (text) => change(latest.current?.reason ?? null, text),
    send: () => void send(),
    cancel: () => {
      if (!busy.current) setDraft(null);
    },
  };
}

/** The report window's props from the open draft and the flow (ReportSheet), less where focus returns, which only the screen knows. */
export function reportSheetProps(flow: ReportFlow, draft: ReportDraft, rulesHref: string) {
  return {
    targetKind: draft.target.kind,
    reason: draft.reason,
    details: draft.details,
    errors: draft.errors,
    sending: draft.sending,
    failure: draft.failure,
    focus: draft.focus,
    rulesHref,
    onReasonChange: flow.chooseReason,
    onDetailsChange: flow.changeDetails,
    onSend: flow.send,
    onCancel: flow.cancel,
  } satisfies Omit<ReportSheetProps, 'finalFocus'>;
}
