import { cn } from '@/lib/cn';
import { AnonIcon, UserIcon } from './icons';

export interface AvatarProps {
  /** The person's name. Empty or absent shows a generic person icon. */
  name?: string;
  /** True when the name is shown beside the avatar: it then adds nothing for a screen reader. */
  decorative?: boolean;
  /** The accessible name when the avatar is not decorative and `name` is empty. */
  label?: string;
  /** `md` is 40px; `sm` is 24px with caption text; `s` is 32px (a comment); `lg` is 88px (the profile page). */
  size?: 'sm' | 's' | 'md' | 'lg';
  /** An anonymous writer: a grey circle with the dashed person, never initials or a photo. */
  anonymous?: boolean;
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
  lg: { box: 'size-22 text-h1', icon: 'size-10' },
  md: { box: 'size-10 text-label font-bold', icon: 'size-5' },
  s: { box: 'size-8 text-caption font-bold', icon: 'size-4' },
  sm: { box: 'size-6 text-caption', icon: 'size-4' },
} as const;

// One of the six avatar pastels, fixed per name (the same person always gets the same colour).
const PASTELS = ['bg-avatar-1', 'bg-avatar-2', 'bg-avatar-3', 'bg-avatar-4', 'bg-avatar-5', 'bg-avatar-6'] as const;
const pastelOf = (name: string): string => {
  let hash = 0;
  for (const char of name.trim()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return PASTELS[hash % PASTELS.length] ?? PASTELS[0];
};

// The profile photo when there is one (I5), else initials on a pastel picked from the name, in the text colour (tokens.md); the empty
// state is a neutral surface with the person icon, and an anonymous writer a grey circle with an outline and the dashed person.
// An avatar with no name to announce (decorative, or no name and no `label`) is hidden from
// assistive technology rather than left as an unnamed image.
export function Avatar({ name = '', decorative = false, label, size = 'md', src, anonymous = false, className }: AvatarProps) {
  if (anonymous) {
    return (
      <span
        {...(decorative || label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
        className={cn('inline-grid shrink-0 place-items-center rounded-full bg-accent text-muted-foreground ring-1 ring-input ring-inset', sizes[size].box, className)}
      >
        <AnonIcon className={sizes[size].icon} />
      </span>
    );
  }
  const initials = initialsOf(name);
  const accessibleName = decorative ? undefined : initials !== '' ? name.trim() : label;
  const named = accessibleName !== undefined && accessibleName !== '';
  if (src !== undefined && src !== null && src !== '') {
    // the same named (or hidden) frame as the initials, with the photo inside it as decoration
    return (
      <span
        {...(named ? { role: 'img', 'aria-label': accessibleName } : { 'aria-hidden': true })}
        className={cn('inline-flex shrink-0 overflow-hidden rounded-full bg-muted', sizes[size].box, className)}
      >
        <img src={src} alt="" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      {...(named ? { role: 'img', 'aria-label': accessibleName } : { 'aria-hidden': true })}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full',
        sizes[size].box,
        initials !== '' ? cn(pastelOf(name), 'text-foreground') : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {initials !== '' ? <span aria-hidden="true">{initials}</span> : <UserIcon className={sizes[size].icon} />}
    </span>
  );
}
