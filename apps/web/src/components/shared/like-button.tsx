import { cn } from '@/lib/cn';
import { HeartIcon } from '../ui/icons';

export interface LikeButtonProps {
  /** The word for the action ("לייק"); with a count of 1 or more the accessible name is "<label>, <count>". */
  label: string;
  /** How many likes the viewer can see on the target. */
  count: number;
  /** Whether the viewer's own like is on: `aria-pressed`, and the heart is filled. */
  liked: boolean;
  /** Toggle. The caller changes the count at once, sends one request and reverts on failure; the button holds no state. */
  onToggle: () => void;
}

// A like toggle on a post or comment (FR-FEED-001): a heart, the word and the count. The pressed state is never colour alone (the heart is
// filled and `aria-pressed` is set). Display only: what toggling does comes in as onToggle. The target is at least 44×44 px.
export function LikeButton({ label, count, liked, onToggle }: LikeButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={count > 0 ? `${label}, ${count.toLocaleString('en-US')}` : label}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-label',
        'transition-colors duration-fast ease-standard hover:bg-muted',
        liked ? 'text-primary-strong' : 'text-muted-foreground',
      )}
    >
      <HeartIcon className={cn('size-5', liked && 'fill-current')} />
      <span aria-hidden="true">{label}</span>
      {count > 0 ? <span aria-hidden="true">{count.toLocaleString('en-US')}</span> : null}
    </button>
  );
}
