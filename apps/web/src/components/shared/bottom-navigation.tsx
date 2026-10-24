import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isPlainClick } from '@/lib/is-plain-click';

export interface BottomNavigationItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
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

// One nav, two shapes: a bar fixed to the bottom edge below 1024, a vertical rail at the inline-start
// edge from 1024 (NFR-USE-001). The current item is marked by aria-current, a heavier label and a pill
// behind the icon, so it does not rest on colour alone.
export function BottomNavigation({ items, label, onNavigate, className }: BottomNavigationProps) {
  const currentKey = items.find((item) => item.current === true)?.key;
  return (
    <nav
      aria-label={label}
      className={cn(
        'sticky bottom-0 z-sticky border-t border-border bg-card',
        'lg:top-16 lg:bottom-auto lg:w-24 lg:self-start lg:border-t-0 lg:bg-transparent',
        className,
      )}
    >
      <ul className="m-0 flex list-none px-1 pt-1.5 pb-2 lg:flex-col lg:gap-1.5 lg:p-0">
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
                  'group relative flex min-h-14 flex-col items-center gap-0.5 rounded-md pt-1 text-center text-caption no-underline',
                  current ? 'font-semibold text-primary-strong' : 'text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-8 w-14 place-items-center rounded-full transition-colors duration-fast ease-standard',
                    current ? 'bg-primary-soft' : 'group-hover:bg-muted',
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
                {item.badge}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
