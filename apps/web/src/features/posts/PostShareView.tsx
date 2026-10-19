import type { ShareReadView } from '@nestly/shared';
import { postPath } from '@/lib/post-link';
import { PostLinkButton } from './PostLinkButton';
import { OriginalQuote } from './OriginalQuote';
import { MEMBER_FALLBACK_LABEL } from './feed-texts';
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
          <OriginalQuote className="w-full" testId="post-original" quote={original} />
          <PostLinkButton to={postPath(original.id)} variant="text">
            {TO_ORIGINAL_LABEL}
          </PostLinkButton>
        </div>
      ) : (
        <OriginalQuote quote={null} unavailableTestId="post-original-unavailable" />
      )}
    </>
  );
}
