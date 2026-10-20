import { useState } from 'react';
import type { StoryAuthorGroup } from '@nestly/shared';
import { MediaTile } from '@/components/shared/media-tile';
import { Button } from '@/components/ui/button';
import { SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { formatPostTime } from '@/lib/format-post-time';
import { PENDING_LABEL } from '@/lib/media-texts';
import { CLOSE_LABEL, MEMBER_FALLBACK, MY_STORY_LABEL, NEXT_LABEL, PENDING_HINT, PREVIOUS_LABEL, storyOf, storyPosition } from './stories-texts';

export interface StoryViewerProps {
  group: StoryAuthorGroup | null;
  onClose: () => void;
}

// One author's live Stories, oldest first (FR-FEED-008): the picture, the text, the time, "הסטורי הבא" / "הסטורי הקודם". No likes,
// comments or viewer list. The author's own unchecked Story says "ממתין לבדיקה".
export function StoryViewer({ group, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(0);
  const items = group?.items ?? [];
  const current = items[Math.min(index, items.length - 1)];
  const title = group === null ? '' : group.isMine ? MY_STORY_LABEL : storyOf(group.authorName ?? MEMBER_FALLBACK);
  return (
    <SheetPanel
      open={group !== null}
      onOpenChange={(next) => {
        if (!next) {
          setIndex(0);
          onClose();
        }
      }}
      described={false}
    >
      <SheetTitle>{title}</SheetTitle>
      {current === undefined ? null : (
        <div className="flex flex-col gap-3">
          <MediaTile image={current.image} alt={title} fit="contain" className="max-h-96 w-full" />
          {current.caption !== null ? (
            <p dir="auto" className="whitespace-pre-wrap wrap-anywhere text-body">
              {current.caption}
            </p>
          ) : null}
          <p className="text-small text-muted-foreground">
            {formatPostTime(current.createdAt)} · {storyPosition(index, items.length)}
          </p>
          {current.image.state === 'pending' ? <p className="text-small text-muted-foreground">{`${PENDING_LABEL}. ${PENDING_HINT}`}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <Button variant="soft" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              {PREVIOUS_LABEL}
            </Button>
            <Button variant="soft" disabled={index >= items.length - 1} onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}>
              {NEXT_LABEL}
            </Button>
          </div>
          <Button variant="text" className="self-center" onClick={() => { setIndex(0); onClose(); }}>
            {CLOSE_LABEL}
          </Button>
        </div>
      )}
    </SheetPanel>
  );
}
