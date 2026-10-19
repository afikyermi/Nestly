import { formatPostTime } from '@/lib/format-post-time';
import type { PostAudience } from '@nestly/shared';
import { AUDIENCE_LABELS } from './posts-texts';
import { MEMBER_FALLBACK_LABEL, ORIGINAL_UNAVAILABLE_TEXT } from './feed-texts';

/** What the quote shows: the post's author (null: no name line, e.g. a plain post's own page), audience, time and text. */
export interface QuoteContent {
  author: { name: string | null } | null;
  audience: PostAudience;
  createdAt: string;
  body: string;
}

export interface OriginalQuoteProps {
  /** The quoted post, or null when it is no longer available ("הפוסט המקורי כבר לא זמין", nothing of it). */
  quote: QuoteContent | null;
  /** Placement only (the card orders it in its flex row). */
  className?: string;
  testId?: string;
  unavailableTestId?: string;
}

// The quoted original of a share, drawn once for the feed card, the post page's share view and the share-in-feed window (ux-polish-b c10).
// The texts are the people's own: plain text, their own direction.
export function OriginalQuote({ quote, className, testId, unavailableTestId }: OriginalQuoteProps) {
  if (quote === null) {
    return (
      <p data-testid={unavailableTestId} className={`${className ?? ''} rounded-md bg-muted p-3 text-small text-muted-foreground`.trim()}>
        {ORIGINAL_UNAVAILABLE_TEXT}
      </p>
    );
  }
  return (
    <blockquote data-testid={testId} className={`${className ?? ''} flex flex-col gap-2 rounded-md bg-muted p-3`.trim()}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {quote.author !== null ? <span className="text-label">{quote.author.name ?? MEMBER_FALLBACK_LABEL}</span> : null}
        <span className="text-small text-muted-foreground">{AUDIENCE_LABELS[quote.audience]}</span>
        <time dateTime={quote.createdAt} className="text-small text-muted-foreground">
          {formatPostTime(quote.createdAt)}
        </time>
      </div>
      <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
        {quote.body}
      </p>
    </blockquote>
  );
}
