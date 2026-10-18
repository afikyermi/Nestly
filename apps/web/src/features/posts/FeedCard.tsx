import { useId } from 'react';
import { Link } from 'react-router';
import { ANONYMOUS_AUTHOR_LABEL, type FeedUnit } from '@nestly/shared';
import { AUDIENCE_LABELS } from './posts-texts';
import { STAGE_LABELS } from '@/lib/child-fields';
import { formatPostTime } from '@/lib/format-post-time';
import { postPath } from '@/lib/post-link';
import { MEMBER_FALLBACK_LABEL, ORIGINAL_UNAVAILABLE_TEXT } from './feed-texts';

type Original = Extract<FeedUnit, { kind: 'share' }>['original'];

const AUDIENCE_CLASS = 'text-small text-muted-foreground';

/** The text of a post, as the person wrote it: plain text, line breaks kept, its own direction. */
function Text({ children }: { children: string }) {
  return (
    <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
      {children}
    </p>
  );
}

function OriginalBlock({ original }: { original: Original }) {
  if (!original.available) {
    return <p className="rounded-md bg-muted p-3 text-small text-muted-foreground">{ORIGINAL_UNAVAILABLE_TEXT}</p>;
  }
  return (
    <blockquote className="flex flex-col gap-2 rounded-md bg-muted p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-label">{original.author.name ?? MEMBER_FALLBACK_LABEL}</span>
        <span className={AUDIENCE_CLASS}>{AUDIENCE_LABELS[original.audience]}</span>
        <time dateTime={original.createdAt} className={AUDIENCE_CLASS}>
          {formatPostTime(original.createdAt)}
        </time>
      </div>
      <Text>{original.body}</Text>
    </blockquote>
  );
}

export interface FeedCardProps {
  unit: FeedUnit;
  /** 1-based place in the list so far (`aria-posinset`). */
  position: number;
}

// One unit of the feed (F3.2b c14-c17): a post, an anonymous post (only "אנונימי": no name, avatar or link) or a share with its
// original. Display only, and no action row: the only link is the time, to the post. The card is a tab stop so a screen reader's
// feed navigation can reach it; its name is its author line. The text is the user's own, so it is plain text (never markup).
export function FeedCard({ unit, position }: FeedCardProps) {
  const authorId = useId();
  const author = unit.isAnonymous ? ANONYMOUS_AUTHOR_LABEL : (unit.author.name ?? MEMBER_FALLBACK_LABEL);
  return (
    <article
      aria-labelledby={authorId}
      aria-posinset={position}
      aria-setsize={-1}
      tabIndex={0}
      className="flex flex-col gap-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span id={authorId} className="text-label">
            {author}
          </span>
          <Link
            to={postPath(unit.id)}
            className="inline-flex min-h-11 min-w-11 items-center rounded-sm text-small text-muted-foreground underline underline-offset-4"
          >
            <time dateTime={unit.createdAt}>{formatPostTime(unit.createdAt)}</time>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={AUDIENCE_CLASS}>{AUDIENCE_LABELS[unit.audience]}</span>
          {unit.stageTag !== null ? (
            <span className="rounded-full bg-badge px-2.5 text-small text-badge-foreground">{STAGE_LABELS[unit.stageTag]}</span>
          ) : null}
        </div>
      </header>
      {unit.kind === 'post' ? <Text>{unit.body}</Text> : null}
      {unit.kind === 'share' ? (
        <>
          {unit.sharerText !== null ? <Text>{unit.sharerText}</Text> : null}
          <OriginalBlock original={unit.original} />
        </>
      ) : null}
    </article>
  );
}
