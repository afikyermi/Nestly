import { Button } from '@/components/ui/button';
import { HIDDEN_CARD_LABEL, HIDDEN_CARD_TEXT, UNDOING_TEXT, UNDO_HIDE_LABEL } from './hide-texts';

export interface HiddenPostCardProps {
  /** The id of the unit it stands for (focus returns here after a hide). */
  unitId: string;
  /** The hidden card's place in the list (`aria-posinset`, unchanged). */
  position: number;
  /** The undo is in flight: the button shows "מבטלים" and does nothing more. */
  pending: boolean;
  onUndo: () => void;
}

// The placeholder of a card the viewer just hid (F3.9 c9): in place of the card, same position in the feed, one line and the undo. It lives
// only while the feed screen is mounted (the screen decides). Display only: the undo comes in as onUndo.
export function HiddenPostCard({ unitId, position, pending, onUndo }: HiddenPostCardProps) {
  return (
    <article
      aria-label={HIDDEN_CARD_LABEL}
      aria-posinset={position}
      aria-setsize={-1}
      data-unit-id={unitId}
      tabIndex={0}
      className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 text-body text-muted-foreground lg:rounded-lg lg:p-5 lg:shadow-card"
    >
      <p>{HIDDEN_CARD_TEXT}</p>
      <Button variant="soft" pending={pending} onClick={onUndo} data-hide-undo="">
        {pending ? UNDOING_TEXT : UNDO_HIDE_LABEL}
      </Button>
    </article>
  );
}
