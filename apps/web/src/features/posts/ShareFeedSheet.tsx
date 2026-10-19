import { useEffect, useId, useRef } from 'react';
import { POST_AUDIENCES, POST_BODY_MAX, codePointLength, type PostAudience } from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import { formatPostTime } from '@/lib/format-post-time';
import { MEMBER_FALLBACK_LABEL } from './feed-texts';
import { AUDIENCE_LABELS, BODY_TOO_LONG_TEXT, RETRY_LABEL, remainingText } from './posts-texts';
import {
  SHARE_AUDIENCE_LEGEND,
  SHARE_CANCEL_LABEL,
  SHARE_IN_FEED_LABEL,
  SHARE_SUBMIT_LABEL,
  SHARE_TEXT_LABEL,
  SHARING_TEXT,
} from './share-texts';
import type { ShareQuote } from './use-share-in-feed';

/** The counter speaks only at this many characters left or fewer (the composer's rule). */
const COUNTER_FROM = 100;
const AUDIENCE_OPTIONS = POST_AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }));
const isAudience = (value: string): value is PostAudience => POST_AUDIENCES.some((audience) => audience === value);

export interface ShareFeedSheetProps {
  quote: ShareQuote;
  text: string;
  audience: PostAudience;
  /** The text is over the limit (shown after a refused send). */
  tooLong: boolean;
  sending: boolean;
  /** Why the last send failed, as an alert in the window; `retry` adds "נסו שוב". */
  failure: { text: string; retry: boolean } | null;
  /** Focus the text box, once per tick (0: none). */
  focusTick: number;
  onTextChange: (text: string) => void;
  onAudienceChange: (audience: PostAudience) => void;
  onSend: () => void;
  /** ביטול, Escape, a press outside: the caller closes the window (or keeps it while `sending`). */
  onCancel: () => void;
  /** Where focus goes when it closes; unset or null: back to the element that opened it. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// The share-in-feed window (F3.5 c10, c11; FR-FEED-006) on the shared sheet: the post being shared as a quote (its author, audience, time and
// text; no link inside), the sharer's optional text with the composer's counter, who sees the share, "שיתוף" and "ביטול". Display only: what
// sending does comes in as props. Focus starts in the text box and stays inside; the quoted text is the author's own, so it is plain text.
export function ShareFeedSheet(props: ShareFeedSheetProps) {
  const { quote, text, audience, tooLong, sending, failure, focusTick, onTextChange, onAudienceChange, onSend, onCancel, finalFocus } = props;
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const left = POST_BODY_MAX - codePointLength(text.trim());

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('textarea')?.focus();
  }, [focusTick]);

  return (
    <SheetPanel
      open
      described={false}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      onOpened={(panel) => panel.querySelector<HTMLElement>('textarea')?.focus()}
      finalFocus={finalFocus}
    >
      <SheetTitle>{SHARE_IN_FEED_LABEL}</SheetTitle>
      <blockquote className="flex flex-col gap-2 rounded-md bg-muted p-3 text-body">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-label">{quote.name ?? MEMBER_FALLBACK_LABEL}</span>
          <span className="text-small text-muted-foreground">{AUDIENCE_LABELS[quote.audience]}</span>
          <time dateTime={quote.createdAt} className="text-small text-muted-foreground">
            {formatPostTime(quote.createdAt)}
          </time>
        </div>
        <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
          {quote.body}
        </p>
      </blockquote>
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending) onSend();
        }}
      >
        {failure !== null ? (
          <div className="flex flex-col items-start gap-3">
            <div className="w-full">
              <InlineAlert>{failure.text}</InlineAlert>
            </div>
            {failure.retry ? (
              <Button variant="soft" pending={sending} onClick={onSend}>
                {RETRY_LABEL}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <FormField label={SHARE_TEXT_LABEL} htmlFor={`${ids}-text`} {...(tooLong ? { error: BODY_TOO_LONG_TEXT } : {})}>
            {(control) => <TextArea {...control} rows={3} value={text} onChange={(event) => onTextChange(event.target.value)} />}
          </FormField>
          {/* The polite region is always mounted; it speaks only in the limit's last 100 characters. */}
          <p role="status" className="text-small text-muted-foreground empty:sr-only">
            {left <= COUNTER_FROM ? remainingText(left) : ''}
          </p>
        </div>
        <ChoiceCardGroup
          legend={SHARE_AUDIENCE_LEGEND}
          name={`${ids}-audience`}
          options={AUDIENCE_OPTIONS}
          value={audience}
          onChange={(value) => {
            if (isAudience(value)) onAudienceChange(value);
          }}
        />
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" block pending={sending} disabled={sending}>
            {sending ? SHARING_TEXT : SHARE_SUBMIT_LABEL}
          </Button>
          <Button variant="text" className="self-center" aria-disabled={sending ? true : undefined} onClick={onCancel}>
            {SHARE_CANCEL_LABEL}
          </Button>
        </div>
      </form>
    </SheetPanel>
  );
}
