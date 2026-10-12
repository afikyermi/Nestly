import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { DrawerPanel, DrawerTitle } from '../ui/dialog';
import { CloseIcon } from '../ui/icons';

export interface SideDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's accessible name, shown as its heading. */
  title: string;
  /** The accessible name of the close control. */
  closeLabel: string;
  children: ReactNode;
}

// A modal panel from the inline-start edge. Controlled, so the shell can own the Hamburger as well.
// Focus moves in, is trapped, and returns to the element that opened it when the drawer closes.
export function SideDrawer({ open, onOpenChange, title, closeLabel, children }: SideDrawerProps) {
  return (
    <DrawerPanel open={open} onOpenChange={onOpenChange}>
      <div className={'flex items-center justify-between gap-2 border-b border-border p-1.5 ps-4'}>
        <DrawerTitle>{title}</DrawerTitle>
        <Button iconOnly label={closeLabel} onClick={() => onOpenChange(false)}>
          <CloseIcon />
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{children}</div>
    </DrawerPanel>
  );
}
