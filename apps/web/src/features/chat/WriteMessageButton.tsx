import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { chatTextProblem } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { useChatCall } from '@/hooks/use-chat-call';
import { conversationPath } from '@/lib/chat-link';
import { startChat } from '@/services/api/chat';
import {
  ACTION_FAILED_TEXT,
  CANNOT_SEND_TEXT,
  CLOSE_LABEL,
  EMPTY_TEXT,
  NOT_ALLOWED_TEXT,
  RATE_LIMITED_TEXT,
  REQUEST_PENDING_TEXT,
  REQUEST_SENT_TEXT,
  SEND_LABEL,
  TOO_LONG_TEXT,
  WRITE_LABEL,
  WRITE_REQUEST_NOTE,
  WRITE_TITLE,
} from '@/lib/chat-texts';

// "שליחת הודעה" on another person's profile (FR-CHAT-002): the first message goes where the rules say. A conversation that exists goes on and
// Friends open one (the screen moves to it); anyone else gets a chat request with this text as its opening message (FR-CHAT-003), and the
// conversation opens only if it is accepted. The server decides which; the note under the field says so before anything is sent.
export function WriteMessageButton({ userId, name }: { userId: string; name: string }) {
  const call = useChatCall();
  const navigate = useNavigate();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const wrong = chatTextProblem(text);
    if (wrong !== null) {
      setProblem(wrong === 'long' ? TOO_LONG_TEXT : EMPTY_TEXT);
      return;
    }
    busy.current = true;
    setSending(true);
    setProblem(null);
    setFailure(null);
    try {
      const result = await call((token) => startChat(token, userId, text));
      if (result.kind === 'ok') {
        if (result.value.kind === 'conversation') {
          void navigate(conversationPath(result.value.conversationId));
          return;
        }
        setOpen(false);
        setText('');
        setStatus(REQUEST_SENT_TEXT);
        return;
      }
      setFailure(
        result.kind === 'request-pending'
          ? REQUEST_PENDING_TEXT
          : result.kind === 'blocked'
            ? CANNOT_SEND_TEXT
            : result.kind === 'rate-limited'
              ? RATE_LIMITED_TEXT
              : result.kind === 'not-allowed' || result.kind === 'unavailable'
                ? NOT_ALLOWED_TEXT
                : ACTION_FAILED_TEXT,
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className={status === '' ? 'sr-only' : 'text-label'}>
        {status}
      </p>
      {open ? (
        <form onSubmit={(event) => void send(event)} id={formId} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <FormField label={WRITE_TITLE(name)} hint={WRITE_REQUEST_NOTE} {...(problem === null ? {} : { error: problem })}>
            {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
          </FormField>
          {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
          <div className="flex gap-2">
            <Button type="submit" pending={sending}>
              {SEND_LABEL}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                if (busy.current) return;
                setOpen(false);
                setFailure(null);
                setProblem(null);
              }}
            >
              {CLOSE_LABEL}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            variant="soft"
            onClick={() => {
              setStatus('');
              setOpen(true);
            }}
          >
            {WRITE_LABEL}
            <span className="sr-only"> אל {name}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
