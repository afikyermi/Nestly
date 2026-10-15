import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { RecoveryAnswerFields } from '@/components/domain/recovery-answer-fields';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { EMPTY_ANSWERS, type AnswerValues } from '@/lib/recovery-answers';
import { changeRecoveryQuestions, saveRecoveryQuestions } from '@/services/api/recovery';
import {
  CHANGE_INTRO_TEXT,
  CHANGED_TEXT,
  INTRO_TEXT,
  SAVE_FAILED_TEXT,
  saveFailureText,
  validateQuestions,
  type QuestionsErrors,
} from './recovery-questions-form';

const TITLE = 'שאלות לשחזור סיסמה';

// The recovery questions screen (FR-AUTH-003, F1.6 criteria 17, 18), inside the shell's `main`. Two modes with one form: setup,
// while the account has none saved (the guard holds the user here, so there is no way to skip), and change from the menu, which
// asks for the current two answers first. The mode is fixed when the screen opens: saving flips the session flag at once. The
// answers live in this component memory only and go only in the request body.
export function RecoveryQuestionsForm() {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const { needsRecoveryQuestions } = useSession();
  const [setup] = useState(needsRecoveryQuestions);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [current, setCurrent] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  // True from the first refused submit until a valid one goes out: field errors then follow every keystroke.
  const [validating, setValidating] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [messageTick, setMessageTick] = useState(0);

  const checked = validating ? validateQuestions(!setup, current, answers) : null;
  const errors: QuestionsErrors = checked !== null && !checked.ok ? checked.errors : {};

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (messageTick === 0) return;
    messageRef.current?.focus();
  }, [messageTick]);

  async function submit() {
    if (running.current) return;
    const result = validateQuestions(!setup, current, answers);
    if (!result.ok) {
      setValidating(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    setValidating(false);
    running.current = true;
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const token = account === null ? null : await account.getAccessToken();
      if (account === null || token === null) {
        setFailure(SAVE_FAILED_TEXT);
        setMessageTick((tick) => tick + 1);
        return;
      }
      const outcome = setup
        ? await saveRecoveryQuestions(token, result.answers)
        : await changeRecoveryQuestions(token, result.current, result.answers);
      if (outcome !== 'done') {
        setFailure(saveFailureText(outcome));
        setMessageTick((tick) => tick + 1);
        return;
      }
      setCurrent(EMPTY_ANSWERS);
      setAnswers(EMPTY_ANSWERS);
      account.markRecoveryQuestionsSet();
      if (setup) {
        void navigate(PATHS.feed, { replace: true });
      } else {
        setSaved(true);
        setMessageTick((tick) => tick + 1);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <p className="mt-1 mb-5 text-body text-muted-foreground">{setup ? INTRO_TEXT : CHANGE_INTRO_TEXT}</p>
      {failure !== null ? (
        <div ref={messageRef} tabIndex={-1} className="mb-5">
          <InlineAlert>{failure}</InlineAlert>
        </div>
      ) : null}
      {saved ? (
        <div ref={messageRef} tabIndex={-1} role="status" className="mb-5 text-body">
          {CHANGED_TEXT}
        </div>
      ) : null}
      <form
        ref={formRef}
        noValidate
        className="flex max-w-md flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {setup ? null : (
          <RecoveryAnswerFields
            legend="ענו על השתיים ששמרתם עכשיו"
            values={current}
            onChange={(question, value) => setCurrent((values) => ({ ...values, [question]: value }))}
            {...(errors.current !== undefined ? { errors: errors.current } : {})}
          />
        )}
        <RecoveryAnswerFields
          legend={setup ? 'בחרו שתיים מהשאלות וענו עליהן' : 'בחרו שתיים מהשאלות החדשות וענו עליהן'}
          values={answers}
          onChange={(question, value) => setAnswers((values) => ({ ...values, [question]: value }))}
          {...(errors.answers !== undefined ? { errors: errors.answers } : {})}
        />
        <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
          שמירה
        </Button>
        <span role="status" className="sr-only">
          {busy ? 'שומרים' : ''}
        </span>
      </form>
    </>
  );
}
