import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { shadows, spacingRhythm, typeStyles, zIndex } from '@nestly/shared';

// tailwind-merge only knows Tailwind's default names. Our token names (text-label, px-screen-margin,
// shadow-card, z-popover, duration-fast) would otherwise read as colours or unknown
// classes, and `text-label text-primary` would lose one of the two. The names come from
// the token source, so they cannot drift from it.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: Object.keys(spacingRhythm) },
    classGroups: {
      'font-size': [{ text: Object.keys(typeStyles) }],
      shadow: [{ shadow: Object.keys(shadows) }],
      z: [{ z: Object.keys(zIndex) }],
      duration: [{ duration: ['fast', 'base', 'slow'] }],
      ease: [{ ease: ['standard'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
