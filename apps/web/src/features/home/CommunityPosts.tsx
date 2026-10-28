import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ANONYMOUS_AUTHOR_LABEL, type FeedUnit, type JourneyStage, type StageContext } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { Avatar } from '@/components/ui/avatar';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STAGE_LABELS } from '@/lib/child-fields';
import { postPath } from '@/lib/post-link';
import { recentFeedFirstPage } from '@/services/api/feed';

/** A first page the feed received this recently is used as it is (no request). */
const REUSE_MS = 5 * 60_000;

const TITLE = 'מהקהילה, בשלבים שלכם';
const TO_FEED = 'לפיד';
const MEMBER = 'מהקהילה';

/** The stage tag a post would carry for each kind of journey. */
const STAGE_OF: Record<StageContext['kind'], JourneyStage> = { planning: 'planning', pregnancy: 'pregnant', parenting: 'has_child' };

const commentsText = (count: number): string => (count === 1 ? 'תגובה אחת' : `${count} תגובות`);

/**
 * Up to two posts of the viewer's own feed whose stage tag matches one of its journeys (FR-HOME-001, AC-208; redesign 27.10.2026). The feed's
 * first page is the source (the one the feed received in the last five minutes, else one request), in its own order: only posts the viewer may already see there, nothing promoted, no ranking of its own. Asked
 * after the home has shown; nothing is drawn while it loads, when it fails, or when no post matches.
 */
export function CommunityPosts({ contexts }: { contexts: readonly StageContext[] }) {
  const account = useSessionAccount();
  const [posts, setPosts] = useState<readonly Extract<FeedUnit, { kind: 'post' }>[]>([]);
  const stages = [...new Set(contexts.map((context) => STAGE_OF[context.kind]))].sort().join(',');

  useEffect(() => {
    if (stages === '') return;
    const wanted = new Set(stages.split(','));
    let cancelled = false;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null || cancelled) return;
      const outcome = await recentFeedFirstPage(token, REUSE_MS);
      if (cancelled || outcome.kind !== 'page') return;
      const matching = outcome.page.items.filter(
        (unit): unit is Extract<FeedUnit, { kind: 'post' }> =>
          unit.kind === 'post' && unit.source === 'organic' && unit.stageTag !== null && wanted.has(unit.stageTag),
      );
      setPosts(matching.slice(0, 2));
    })();
    return () => {
      cancelled = true;
    };
  }, [account, stages]);

  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="home-community" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-community" className="text-h3">
          {TITLE}
        </h2>
        <Link to={PATHS.feed} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
          {TO_FEED}
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-divider p-0">
        {posts.map((post) => {
          const author = post.isAnonymous ? ANONYMOUS_AUTHOR_LABEL : (post.author.name ?? MEMBER);
          return (
            <li key={post.id}>
              <Link to={postPath(post.id)} className="flex items-start gap-3 py-3 text-foreground no-underline hover:bg-muted">
                <Avatar decorative size="md" {...(post.isAnonymous ? { anonymous: true } : { name: author })} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span dir="auto" className="line-clamp-2 text-body font-medium">
                    {post.body}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    <bdi>{author}</bdi>
                    {post.stageTag !== null ? <span className="font-bold text-primary-strong"> · {STAGE_LABELS[post.stageTag]}</span> : null}
                    {post.commentCount > 0 ? ` · ${commentsText(post.commentCount)}` : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
