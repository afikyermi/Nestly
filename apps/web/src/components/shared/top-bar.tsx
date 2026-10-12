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
  /** Caller nodes after the logo, at the inline-end edge. Empty by default: no search, chat or bell here. */
  actions?: ReactNode;
  /** Placement only. */
  className?: string;
}

// The Hamburger sits first, so at the inline-start (right) edge in RTL, then the logo.
export function TopBar({ onMenuClick, menuLabel, menuButtonRef, actions, className }: TopBarProps) {
  return (
    <header className={cn('flex items-center gap-0.5 bg-card p-1.5 shadow-bar', className)}>
      <Button iconOnly label={menuLabel} ref={menuButtonRef} onClick={onMenuClick}>
        <MenuIcon />
      </Button>
      <Logo />
      {actions !== undefined ? <div className="ms-auto flex items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}
