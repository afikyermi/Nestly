import type { ShareReadView } from '@nestly/shared';
import { formatPostTime } from '@/lib/format-post-time';
import { postPath } from '@/lib/post-link';
import { PostLinkButton } from './PostLinkButton';
import { AUDIENCE_LABELS } from './posts-texts';
import { MEMBER_FALLBACK_LABEL, ORIGINAL_UNAVAILABLE_TEXT } from './feed-texts';
import { TO_ORIGINAL_LABEL } from './share-texts';

// The body of a share on its post page (F3.5 c12; AC-079, AC-081, BR-065): the sharer's name and text, then the original in a quote with a
// link to its own page, or only "הפוסט המקורי כבר לא זמין" and nothing of it. The texts are the people's own: plain text, their own direction.
export function PostShareView({ share }: { share: ShareReadView }) {
  const { original } = share;
  return (
    <>
      <p data-testid="post-sharer" className="text-label">
        {share.author.name ?? MEMBER_FALLBACK_LABEL}
      </p>
      {share.sharerText !== null ? (
        <p data-testid="post-sharer-text" dir="auto" className="whitespace-pre-wrap wrap-anywhere">
          {share.sharerText}
        </p>
      ) : null}
      {original.available ? (
        <div className="flex flex-col items-start gap-2">
          <blockquote data-testid="post-original" className="flex w-full flex-col gap-2 rounded-md bg-muted p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-label">{original.author.name ?? MEMBER_FALLBACK_LABEL}</span>
              <span className="text-small text-muted-foreground">{AUDIENCE_LABELS[original.audience]}</span>
              <time dateTime={original.createdAt} className="text-small text-muted-foreground">
                {formatPostTime(original.createdAt)}
              </time>
            </div>
            <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
              {original.body}
            </p>
          </blockquote>
          <PostLinkButton to={postPath(original.id)} variant="text">
            {TO_ORIGINAL_LABEL}
          </PostLinkButton>
        </div>
      ) : (
        <p data-testid="post-original-unavailable" className="rounded-md bg-muted p-3 text-small text-muted-foreground">
          {ORIGINAL_UNAVAILABLE_TEXT}
        </p>
      )}
    </>
  );
}
