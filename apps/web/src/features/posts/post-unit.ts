import type { FeedUnit, PostView } from '@nestly/shared';

/**
 * The feed card of a post just published (feed-composer D7), built from the 201 answer and the own full name. A named post is the
 * viewer's own; an anonymous one carries no author key and is not marked as the viewer's, as every anonymous unit of the feed.
 */
export function publishedUnit(post: PostView, fullName: string | null): FeedUnit {
  const common = {
    id: post.id,
    kind: 'post',
    source: 'organic',
    body: post.body ?? '',
    audience: post.audience,
    stageTag: post.stageTag,
    createdAt: post.createdAt,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
  } as const;
  return post.isAnonymous
    ? { ...common, isMine: false, isAnonymous: true }
    : { ...common, isMine: true, isAnonymous: false, author: { name: fullName } };
}
