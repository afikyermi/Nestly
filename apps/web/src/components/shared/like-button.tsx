import { useState } from 'react';
import { cn } from '@/lib/cn';
import { NestFilledIcon, NestIcon } from '../ui/icons';
import { Tooltip } from '../ui/tooltip';

export interface LikeButtonProps {
  /** The word for the action ("לייק"); with a count of 1 or more the accessible name is "<label>, <count>". */
  label: string;
  /** How many likes the viewer can see on the target. */
  count: number;
  /** Whether the viewer's own like is on: `aria-pressed`, and the nest is filled. */
  liked: boolean;
  /** Toggle. The caller changes the count at once, sends one request and reverts on failure; the button holds no state. */
  onToggle: () => void;
  /**
   * `text` (default): the nest, the word and the count, as in a comment's line. `action`: a post's action row (redesign 27.10.2026,
   * NFR-USAB-004): the icon alone below 1024 with its name and a tooltip, the icon and the word from 1024; the count is in the post's counts.
   */
  variant?: 'text' | 'action';
}

// A like toggle on a post or comment (FR-FEED-001, FR-FEED-003): the nest mark, never a heart. The pressed state is never colour alone (the
// nest is filled and `aria-pressed` is set); turning it on plays a short pop and ripple (none under reduced motion). The visible text sits
// inside the accessible name (WCAG 2.5.3). Display only: what toggling does comes in as onToggle. The target is at least 44×44 px.
export function LikeButton({ label, count, liked, onToggle, variant = 'text' }: LikeButtonProps) {
  // Only a like the viewer turns on here animates: a list that loads liked items stays still.
  const [turnedOn, setTurnedOn] = useState(false);
  const toggle = () => {
    setTurnedOn(!liked);
    onToggle();
  };
  const name = count > 0 ? `${label}, ${count.toLocaleString('en-US')}` : label;
  const icon = (
    // Keyed on the state, so the animation restarts each time the like turns on.
    <span key={liked ? 'on' : 'off'} className={cn('relative grid place-items-center', liked && turnedOn && 'animate-like-pop')}>
      {liked ? <NestFilledIcon className={variant === 'action' ? 'size-6' : 'size-4'} /> : <NestIcon className={variant === 'action' ? 'size-6' : 'size-4'} />}
    </span>
  );
  if (variant === 'action') {
    return (
      <Tooltip label={name}>
        <button
          type="button"
          aria-pressed={liked}
          aria-label={name}
          onClick={toggle}
          className={cn(
            'inline-flex size-11 items-center justify-center gap-2 rounded-full text-label transition-colors duration-fast ease-standard hover:bg-muted',
            'lg:h-11 lg:w-auto lg:flex-1 lg:rounded-md',
            liked ? 'font-bold text-primary' : 'text-foreground',
          )}
        >
          {icon}
          <span aria-hidden="true" className="hidden lg:inline">
            {label}
          </span>
        </button>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={name}
      onClick={toggle}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-caption font-bold',
        'transition-colors duration-fast ease-standard hover:bg-muted',
        liked ? 'text-primary-strong' : 'text-muted-foreground',
      )}
    >
      {icon}
      <span>
        {label}
        {count > 0 ? <span className="tabular-nums"> {count.toLocaleString('en-US')}</span> : null}
      </span>
    </button>
  );
}
