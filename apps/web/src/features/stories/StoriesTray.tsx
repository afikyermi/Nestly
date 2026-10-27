import { useState } from 'react';
import { STORIES_PER_DAY, type StoryAuthorGroup } from '@nestly/shared';
import { Avatar } from '@/components/ui/avatar';
import { PlusIcon } from '@/components/ui/icons';
import { useAudienceMemory } from '@/hooks/use-audience-memory';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { usePostingRight } from '@/hooks/use-posting-right';
import { ADD_STORY_LABEL, LIMIT_TEXT, MEMBER_FALLBACK, MY_STORY_LABEL, storyOf, TRAY_LABEL } from './stories-texts';
import { StoryComposer } from './StoryComposer';
import { StoryViewer } from './StoryViewer';
import { useStories } from './use-stories';

// The Stories tray at the top of the feed (FR-FEED-008, AC-102, AC-103): "הוספת סטורי" for a Regular account (a Professional has none,
// FR-FEED-008 Actor), then one tile per author with live Stories the caller may see, the caller's own first. A tile is 106×180 with corners
// 14: the author's latest Story image filling it, the avatar in a white ring in its corner and the name at the bottom. Nothing while loading
// or when it failed: the feed stays as it is.
export function StoriesTray() {
  const { state, reload } = useStories();
  const right = usePostingRight();
  const own = useOwnUserId();
  const memory = useAudienceMemory(own.kind === 'known' ? `story.${own.userId}` : null);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<StoryAuthorGroup | null>(null);
  if (state.kind !== 'ready') return null;
  const canAdd = right === 'allowed';
  const full = state.data.postedToday >= STORIES_PER_DAY;
  if (!canAdd && state.data.groups.length === 0) return null;
  return (
    <section aria-label={TRAY_LABEL} className="mt-4 w-full max-w-md">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {canAdd ? (
          <li>
            <button
              type="button"
              disabled={full}
              onClick={() => setComposing(true)}
              className="relative flex h-45 w-26.5 flex-col items-center overflow-hidden rounded-lg bg-card text-caption font-bold text-foreground shadow-card focus-visible:outline-2 disabled:opacity-60"
            >
              <span aria-hidden="true" className="h-29.5 w-full bg-brand-subtle" />
              <span className="absolute top-25 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
                <PlusIcon className="size-5" />
              </span>
              <span className="mt-auto mb-3 px-2 text-center">{ADD_STORY_LABEL}</span>
            </button>
          </li>
        ) : null}
        {state.data.groups.map((group) => {
          const name = group.isMine ? MY_STORY_LABEL : (group.authorName ?? MEMBER_FALLBACK);
          const cover = group.items.at(-1)?.image.url ?? null;
          return (
            <li key={group.authorId}>
              <button
                type="button"
                onClick={() => setViewing(group)}
                aria-label={group.isMine ? MY_STORY_LABEL : storyOf(group.authorName ?? MEMBER_FALLBACK)}
                className="relative flex h-45 w-26.5 flex-col justify-between overflow-hidden rounded-lg bg-muted p-2 text-caption font-bold text-primary-foreground focus-visible:outline-2"
              >
                {cover === null ? null : <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />}
                <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-foreground/10 via-transparent to-foreground/60" />
                <span className="relative self-start rounded-full bg-primary p-0.5 ring-2 ring-card">
                  <Avatar name={group.authorName ?? ''} size="s" decorative />
                </span>
                <span className="relative w-full truncate text-start">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canAdd && full ? <p className="text-small text-muted-foreground">{LIMIT_TEXT}</p> : null}
      {composing ? (
        <StoryComposer
          open
          memory={memory}
          onClose={() => setComposing(false)}
          onPublished={() => {
            setComposing(false);
            void reload();
          }}
        />
      ) : null}
      <StoryViewer group={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
