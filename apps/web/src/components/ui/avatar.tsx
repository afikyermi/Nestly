import { cn } from '@/lib/cn';
import { UserIcon } from './icons';

export interface AvatarProps {
  /** The person's name. Empty or absent shows a generic person icon. */
  name?: string;
  /** True when the name is shown beside the avatar: it then adds nothing for a screen reader. */
  decorative?: boolean;
  /** The accessible name when the avatar is not decorative and `name` is empty. */
  label?: string;
  /** `md` is 40px; `sm` is 24px with caption text; `lg` is 96px (the profile page). */
  size?: 'sm' | 'md' | 'lg';
  /** I5: the profile photo's address, when there is one the viewer may see; otherwise the initials or the icon. */
  src?: string | null;
  /** Placement only (margin, alignment). */
  className?: string;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// The first grapheme cluster of each of the first two words that start with a letter, upper-cased
// with the locale: "נועה רז" -> "נר", one word -> one letter, "- נועה" skips the dash.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => [...segmenter.segment(word)][0]?.segment ?? '')
    .join('')
    .toLocaleUpperCase('he');
}

const sizes = {
  lg: { box: 'size-24 text-h2', icon: 'size-10' },
  md: { box: 'size-10 text-label', icon: 'size-5' },
  sm: { box: 'size-6 text-caption', icon: 'size-4' },
} as const;

// The profile photo when there is one (I5), else initials. Colour is a soft background with the deep tone of the
// same hue (direction.md); the empty state is a neutral surface with the person icon.
// An avatar with no name to announce (decorative, or no name and no `label`) is hidden from
// assistive technology rather than left as an unnamed image.
export function Avatar({ name = '', decorative = false, label, size = 'md', src, className }: AvatarProps) {
  const initials = initialsOf(name);
  const accessibleName = decorative ? undefined : initials !== '' ? name.trim() : label;
  const named = accessibleName !== undefined && accessibleName !== '';
  if (src !== undefined && src !== null && src !== '') {
    return (
      <img
        src={src}
        alt={named ? accessibleName : ''}
        {...(named ? {} : { 'aria-hidden': true })}
        className={cn('shrink-0 rounded-full bg-muted object-cover', sizes[size].box, className)}
      />
    );
  }
  return (
    <span
      {...(named ? { role: 'img', 'aria-label': accessibleName } : { 'aria-hidden': true })}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full',
        sizes[size].box,
        initials !== '' ? 'bg-primary-soft text-primary-strong' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {initials !== '' ? <span aria-hidden="true">{initials}</span> : <UserIcon className={sizes[size].icon} />}
    </span>
  );
}
