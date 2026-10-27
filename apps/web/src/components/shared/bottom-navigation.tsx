import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isPlainClick } from '@/lib/is-plain-click';

export interface BottomNavigationItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** The filled icon shown while the item is current; unset: the same icon. */
  currentIcon?: ReactNode;
  /** At most one item is current: when several are set, only the first is marked. */
  current?: boolean;
  /**
   * A quiet count drawn on the icon (design-system: `badge`, no red, no pulse), e.g. unread conversations. The item renders it itself and it
   * carries its own screen-reader text after the label ("שיחות, 3 עם הודעות חדשות"); nothing: no badge.
   */
  badge?: ReactNode;
}

export interface BottomNavigationProps {
  items: BottomNavigationItem[];
  /** The accessible name of the nav ("ניווט ראשי"). */
  label: string;
  /**
   * Called with the item's href on a plain click, in place of the browser following the link (client-side
   * routing). A modified click (new tab, new window) is still the browser's.
   */
  onNavigate?: ((href: string) => void) | undefined;
  /** Placement only. */
  className?: string;
}

// One nav, two shapes (redesign 27.10.2026, §7.1): a bar fixed to the bottom edge below 1024, with icons and labels; from 1024 icons only,
// in the middle of the plum top bar (the nav places itself over it), each with its label as its name and tooltip-free text for a screen
// reader. The current item is marked by aria-current, a filled icon and a heavier label below 1024, and a white underline from 1024, so it
// never rests on colour alone.
export function BottomNavigation({ items, label, onNavigate, className }: BottomNavigationProps) {
  const currentKey = items.find((item) => item.current === true)?.key;
  return (
    <nav
      aria-label={label}
      className={cn(
        'sticky bottom-0 z-sticky bg-card shadow-bar',
        'lg:fixed lg:inset-x-0 lg:top-0 lg:bottom-auto lg:mx-auto lg:w-fit lg:bg-transparent lg:shadow-none',
        className,
      )}
    >
      <ul className="m-0 flex list-none px-1 pt-1 pb-1.5 lg:h-16 lg:p-0">
        {items.map((item) => {
          const current = item.key === currentKey;
          return (
            <li key={item.key} className="min-w-0 flex-1 lg:flex-none">
              <a
                href={item.href}
                aria-current={current ? 'page' : undefined}
                onClick={
                  onNavigate === undefined
                    ? undefined
                    : (event) => {
                        if (!isPlainClick(event)) return;
                        event.preventDefault();
                        onNavigate(item.href);
                      }
                }
                className={cn(
                  'group relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-md text-center text-caption no-underline',
                  'lg:h-16 lg:w-14 lg:rounded-none lg:text-primary-foreground lg:hover:bg-primary-strong @7xl:w-27',
                  current ? 'font-bold text-primary-strong' : 'text-muted-foreground',
                )}
              >
                <span aria-hidden="true" className="grid h-7 place-items-center">
                  {current ? (item.currentIcon ?? item.icon) : item.icon}
                </span>
                <span className="lg:sr-only">{item.label}</span>
                {item.badge}
                {current ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 hidden h-0.75 bg-primary-foreground lg:block" /> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
