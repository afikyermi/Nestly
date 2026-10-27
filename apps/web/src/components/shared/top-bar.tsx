import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '../ui/button';
import { MenuIcon } from '../ui/icons';
import { Logo } from './logo';

export interface TopBarProps {
  onMenuClick: () => void;
  /** The Hamburger's accessible name and tooltip ("פתיחת התפריט"). */
  menuLabel: string;
  menuButtonRef?: Ref<HTMLButtonElement>;
  /** The global search: an icon among the actions below 1024, a field beside the logo from 1024. Empty by default. */
  search?: ReactNode;
  /** Caller nodes before the Hamburger, at the inline-end edge (chat, bell). Empty by default. */
  actions?: ReactNode;
  /** Placement only. */
  className?: string;
}

// The plum bar (redesign 27.10.2026): 48 high below 1024, 64 from 1024. The logo sits at the inline-start (right in RTL); the search, the
// caller's actions and the Hamburger at the inline-end, the Hamburger last. From 1024 the search moves beside the logo and the primary
// destinations sit in the middle of the bar (BottomNavigation places itself there). The DOM order is the visual order on both.
export function TopBar({ onMenuClick, menuLabel, menuButtonRef, search, actions, className }: TopBarProps) {
  return (
    <header className={cn('flex h-12 items-center gap-0.5 bg-brand-bar ps-2 pe-1 text-primary-foreground lg:h-16 lg:gap-2 lg:px-4', className)}>
      <Logo tone="onBrand" />
      <span aria-hidden="true" className="flex-1 lg:hidden" />
      {search}
      <span aria-hidden="true" className="hidden flex-1 lg:block" />
      {actions}
      <Button
        iconOnly
        label={menuLabel}
        ref={menuButtonRef}
        onClick={onMenuClick}
        className="text-primary-foreground hover:bg-primary-strong"
      >
        <MenuIcon />
      </Button>
    </header>
  );
}
