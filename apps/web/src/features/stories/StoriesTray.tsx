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
// FR-FEED-008 Actor), then one round button per author with live Stories the caller may see, the caller's own first. Nothing while loading
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
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {canAdd ? (
          <li>
            <button
              type="button"
              disabled={full}
              onClick={() => setComposing(true)}
              className="flex w-20 flex-col items-center gap-1 rounded-md p-1 text-caption text-foreground focus-visible:outline-2 disabled:opacity-60"
            >
              <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary-strong">
                <PlusIcon />
              </span>
              <span>{ADD_STORY_LABEL}</span>
            </button>
          </li>
        ) : null}
        {state.data.groups.map((group) => {
          const name = group.isMine ? MY_STORY_LABEL : (group.authorName ?? MEMBER_FALLBACK);
          return (
            <li key={group.authorId}>
              <button
                type="button"
                onClick={() => setViewing(group)}
                aria-label={group.isMine ? MY_STORY_LABEL : storyOf(group.authorName ?? MEMBER_FALLBACK)}
                className="flex w-20 flex-col items-center gap-1 rounded-md p-1 text-caption text-foreground focus-visible:outline-2"
              >
                <span className="rounded-full p-0.5 ring-2 ring-primary">
                  <Avatar name={group.authorName ?? ''} decorative />
                </span>
                <span className="w-full truncate text-center">{name}</span>
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
