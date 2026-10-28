import { assistantTextProblem } from '@nestly/shared';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { MessageComposer } from '@/components/domain/message-composer';
import { Button } from '@/components/ui/button';
import { ChatWindowDescription, ChatWindowPanel, ChatWindowTitle } from '@/components/ui/dialog';
import { AlertIcon, AssistantIcon, CloseIcon, PhoneIcon } from '@/components/ui/icons';
import { PATHS } from '@/app/paths';
import { useBackCloses } from '@/hooks/use-back-closes';
import { isPlainClick } from '@/lib/is-plain-click';
import {
  ASSISTANT_CLOSE_LABEL,
  ASSISTANT_DISCLAIMER,
  ASSISTANT_DISCLAIMER_LINK,
  ASSISTANT_EMPTY,
  ASSISTANT_FROM_ASSISTANT,
  ASSISTANT_FROM_YOU,
  ASSISTANT_INTRO,
  ASSISTANT_MESSAGE_LABEL,
  ASSISTANT_NAME,
  ASSISTANT_OPEN_LABEL,
  ASSISTANT_PRIVACY_NOTE,
  ASSISTANT_RATE_LIMITED,
  ASSISTANT_SEND_LABEL,
  ASSISTANT_SUGGESTIONS,
  ASSISTANT_SUGGESTIONS_LABEL,
  ASSISTANT_THREAD_LABEL,
  ASSISTANT_TOO_LONG,
  ASSISTANT_TYPING,
  ASSISTANT_UNAVAILABLE,
  ASSISTANT_URGENT,
  ASSISTANT_URGENT_LINK,
} from './assistant-texts';
import { useAssistantConversation } from './use-assistant-conversation';

// The Nestly assistant (Afik 28.10.2026; FR-AI-001, PG-062): a round plum button at the bottom right of every screen of a Regular or Professional
// account (the shell places it clear of the bottom navigation and "חזרה למעלה"), and the conversation window it opens. The window names the
// outside service at its top, keeps the "not medical advice" line and the link to the medical hotlines at its bottom, and offers example questions
// while the conversation is empty. A message holding an urgent word shows the urgent banner under it at once (BR-093), whatever the answer.
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const conversation = useAssistantConversation();
  const { leaveTo } = useBackCloses(open, () => {
    setOpen(false);
    return true;
  });
  const listEnd = useRef<HTMLLIElement>(null);
  const { checkAvailability } = conversation;

  useEffect(() => {
    if (open) void checkAvailability();
  }, [open, checkAvailability]);
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [open, conversation.entries.length, conversation.sending]);

  const submit = async (value: string) => {
    const rule = assistantTextProblem(value);
    if (rule !== null) {
      setProblem(rule === 'long' ? ASSISTANT_TOO_LONG : ASSISTANT_EMPTY);
      return;
    }
    setProblem(null);
    setText('');
    await conversation.send(value);
  };
  const toHotlines = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setOpen(false);
    leaveTo(PATHS.medicalHotlines);
  };
  const hotlinesLink = (label: string, className: string) => (
    <a href={PATHS.medicalHotlines} onClick={toHotlines} className={className}>
      {label}
    </a>
  );
  const unavailable = conversation.availability === 'unavailable';

  return (
    <>
      <Button
        iconOnly
        label={ASSISTANT_OPEN_LABEL}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="assistant-bubble"
        className="size-14 bg-primary text-primary-foreground shadow-card hover:bg-primary-strong"
        onClick={() => setOpen(true)}
      >
        <AssistantIcon className="size-7" />
      </Button>
      <ChatWindowPanel
        open={open}
        onOpenChange={setOpen}
        onOpened={(panel) => (panel.querySelector<HTMLElement>('textarea') ?? panel).focus()}
      >
        <header className="flex items-start gap-3 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            <AssistantIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <ChatWindowTitle className="text-primary-strong">{ASSISTANT_NAME}</ChatWindowTitle>
            <ChatWindowDescription>{ASSISTANT_PRIVACY_NOTE}</ChatWindowDescription>
          </div>
          <Button iconOnly label={ASSISTANT_CLOSE_LABEL} onClick={() => setOpen(false)}>
            <CloseIcon className="size-5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {conversation.entries.length === 0 && !unavailable ? (
            <div className="flex flex-col gap-3">
              <p className="text-body">{ASSISTANT_INTRO}</p>
              <ul aria-label={ASSISTANT_SUGGESTIONS_LABEL} className="flex flex-col gap-2">
                {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-start text-small hover:bg-muted"
                      onClick={() => void submit(suggestion)}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ol aria-label={ASSISTANT_THREAD_LABEL} className="flex flex-col gap-2">
            {conversation.entries.map((entry) =>
              entry.kind === 'notice' ? (
                <li key={entry.id} role="alert" data-testid="assistant-notice" className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-small">
                  <AlertIcon className="mt-0.5 size-5 shrink-0" />
                  <span>{entry.notice === 'rate-limited' ? ASSISTANT_RATE_LIMITED : ASSISTANT_UNAVAILABLE}</span>
                </li>
              ) : entry.kind === 'user' ? (
                <li key={entry.id} className="flex flex-col items-start gap-2">
                  <p dir="auto" className="max-w-xs rounded-xl rounded-es-sm bg-primary-soft px-3.5 py-2 whitespace-pre-wrap wrap-anywhere">
                    <span className="sr-only">{ASSISTANT_FROM_YOU}: </span>
                    {entry.text}
                  </p>
                  {entry.urgent ? (
                    <div role="alert" data-testid="assistant-urgent" className="flex w-full items-start gap-2.5 rounded-md bg-destructive-soft px-3 py-2.5 text-small text-destructive">
                      <PhoneIcon className="mt-0.5 size-5 shrink-0" />
                      <p>
                        {ASSISTANT_URGENT} {hotlinesLink(ASSISTANT_URGENT_LINK, 'font-bold text-destructive underline underline-offset-4')}
                      </p>
                    </div>
                  ) : null}
                </li>
              ) : (
                <li key={entry.id} className="flex justify-end">
                  <p dir="auto" data-testid="assistant-answer" className="max-w-xs rounded-xl rounded-ee-sm border border-border bg-card px-3.5 py-2 whitespace-pre-wrap wrap-anywhere">
                    <span className="sr-only">{ASSISTANT_FROM_ASSISTANT}: </span>
                    {entry.text}
                  </p>
                </li>
              ),
            )}
            <li ref={listEnd} aria-hidden="true" />
          </ol>
          <p role="status" className={conversation.sending ? 'pt-2 text-small text-muted-foreground' : 'sr-only'}>
            {conversation.sending ? ASSISTANT_TYPING : ''}
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-3">
          {unavailable ? (
            <p role="alert" data-testid="assistant-unavailable" className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-small">
              <AlertIcon className="mt-0.5 size-5 shrink-0" />
              <span>{ASSISTANT_UNAVAILABLE}</span>
            </p>
          ) : (
            <MessageComposer
              label={ASSISTANT_MESSAGE_LABEL}
              sendLabel={ASSISTANT_SEND_LABEL}
              text={text}
              onTextChange={(next) => {
                setText(next);
                if (problem !== null) setProblem(null);
              }}
              problem={problem}
              sending={conversation.sending}
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void submit(text);
              }}
            />
          )}
          <p className="text-center text-caption text-muted-foreground">
            {ASSISTANT_DISCLAIMER}
            {hotlinesLink(ASSISTANT_DISCLAIMER_LINK, 'text-primary-strong underline underline-offset-4')}
          </p>
        </div>
      </ChatWindowPanel>
    </>
  );
}
