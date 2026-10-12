import { cn } from '@/lib/cn';
import { UserIcon } from './icons';

export interface AvatarProps {
  /** The person's name. Empty or absent shows a generic person icon. */
  name?: string;
  /** True when the name is shown beside the avatar: it then adds nothing for a screen reader. */
  decorative?: boolean;
  /** The accessible name when the avatar is not decorative and `name` is empty. */
  label?: string;
  className?: string;
}

// First letter of each of the first two words: "נועה רז" -> "נר", one word -> one letter.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}

// Initials only; photos come with I5. Colour is a soft background with the deep tone of the
// same hue (direction.md); the empty state is a neutral surface with the person icon.
// An avatar with no name to announce is hidden from assistive technology rather than left
// as an unnamed image.
export function Avatar({ name = '', decorative = false, label, className }: AvatarProps) {
  const initials = initialsOf(name);
  const accessibleName = decorative ? undefined : initials !== '' ? name.trim() : label;
  const named = accessibleName !== undefined && accessibleName !== '';
  return (
    <span
      {...(named ? { role: 'img', 'aria-label': accessibleName } : { 'aria-hidden': true })}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-full text-label',
        initials !== '' ? 'bg-primary-soft text-primary-strong' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {initials !== '' ? <span aria-hidden="true">{initials}</span> : <UserIcon className="size-5" />}
    </span>
  );
}
