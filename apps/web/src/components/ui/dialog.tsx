import { useRef, type ReactNode } from 'react';
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

interface DrawerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel body; it holds a DrawerTitle, which names the dialog. */
  children: ReactNode;
  /**
   * Where focus goes when the panel closes. Unset, or returning null: the element focused when it opened.
   * For a close that also changes the screen behind it (a menu item that navigates).
   */
  finalFocus?: (() => HTMLElement | null) | undefined;
  className?: string;
}

// The modal layer under SideDrawer: portaled, with a backdrop, a focus trap, Escape to close, page scroll
// locked and the rest of the page hidden from assistive technology (Radix does these). The panel sits at
// the inline-start edge. Radix returns focus only to a Trigger it owns; the drawer is controlled, so the
// element focused when it opened is remembered and given focus back when it closes.
export function DrawerPanel({ open, onOpenChange, children, finalFocus, className }: DrawerPanelProps) {
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-foreground/40" />
        <DialogPrimitive.Content
          ref={panel}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Runs before Radix moves focus in, so the active element is still the opener.
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            // Focus lands on the panel itself, not on the close control, so no tooltip is open when Escape is pressed.
            event.preventDefault();
            panel.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (finalFocus?.() ?? opener.current)?.focus();
          }}
          className={cn(
            'fixed inset-y-0 start-0 z-drawer flex w-72 max-w-full flex-col bg-card text-card-foreground shadow-raised -outline-offset-2',
            className,
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DrawerTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Title className={cn('text-h3', className)}>{children}</DialogPrimitive.Title>;
}

interface AlertPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel body: an AlertTitle (the dialog's name), an AlertDescription when `described`, an AlertCancel and the action. */
  children: ReactNode;
  /** Whether the body holds an AlertDescription, which then describes the dialog (aria-describedby). */
  described: boolean;
  /** Where focus goes when the panel closes. Unset, or returning null: the element focused when it opened. */
  finalFocus?: (() => HTMLElement | null) | undefined;
  className?: string;
}

// The modal layer under ConfirmDialog: role="alertdialog", aria-modal, portaled over a backdrop, a focus trap, Escape to close,
// page scroll locked and the rest of the page hidden from assistive technology (Radix AlertDialog does these). A backdrop press is the
// same cancel as Escape (onOpenChange(false); never the action; ux-polish-b c4); Back is the screen's (useBackCloses).
// Focus opens on the AlertCancel (Radix), so a confirmation is never one Enter away. Controlled: the element focused when it opened is
// remembered and given focus back when it closes, unless `finalFocus` names another.
export function AlertPanel({ open, onOpenChange, children, described, finalFocus, className }: AlertPanelProps) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-foreground/40" onClick={() => onOpenChange(false)} />
        <AlertDialogPrimitive.Content
          aria-modal="true"
          {...(described ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => {
            // Runs before Radix moves focus to the cancel control, so the active element is still the opener.
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (finalFocus?.() ?? opener.current)?.focus();
          }}
          className={cn(
            'fixed inset-x-4 top-1/2 z-dialog mx-auto flex max-w-sm -translate-y-1/2 flex-col gap-4 rounded-lg bg-card p-card-padding',
            'text-card-foreground shadow-raised',
            className,
          )}
        >
          {children}
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export function AlertTitle({ children }: { children: ReactNode }) {
  return <AlertDialogPrimitive.Title className="text-h3 wrap-anywhere">{children}</AlertDialogPrimitive.Title>;
}

export function AlertDescription({ children }: { children: ReactNode }) {
  return <AlertDialogPrimitive.Description className="text-body text-muted-foreground">{children}</AlertDialogPrimitive.Description>;
}

/** The cancel control: its one child (a Button) gets the close behaviour and the focus on open. */
export function AlertCancel({ children }: { children: ReactNode }) {
  return <AlertDialogPrimitive.Cancel asChild>{children}</AlertDialogPrimitive.Cancel>;
}

interface SheetPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel body: a SheetTitle (the dialog's name) and, when `described`, a SheetDescription, which describes it. */
  children: ReactNode;
  /** Whether the body holds a SheetDescription (default true); without one the dialog has no aria-describedby (F3.5, F3.6). */
  described?: boolean;
  /** Called as the panel opens, with the panel: the caller moves focus in (the default, the first focusable, is not used). */
  onOpened?: ((panel: HTMLElement) => void) | undefined;
  /** Where focus goes when the panel closes. Unset, or returning null: the element focused when it opened. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// The sheet of an action done in place (direction.md "דפוסי אינטראקציה": share and report; F3.7 c10, F3.5/F3.6 reuse it): below 1024 px a
// bottom sheet, from 1024 px a small window in the middle. role="dialog", aria-modal, portaled over a backdrop that blurs the page by 4 px; a
// focus trap, the page scroll locked and the rest of the page inert (Radix Dialog). Escape and a press outside close it (onOpenChange(false));
// Back is the screen's (useBackCloses), since only the screen owns the history. Controlled: the element focused when it opened is remembered
// and given focus back when it closes, unless `finalFocus` names another.
export function SheetPanel({ open, onOpenChange, children, described = true, onOpened, finalFocus }: SheetPanelProps) {
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-foreground/40 backdrop-blur-xs" />
        <DialogPrimitive.Content
          ref={panel}
          aria-modal="true"
          {...(described ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            // Runs before Radix moves focus in, so the active element is still the opener.
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (onOpened === undefined || panel.current === null) return;
            event.preventDefault();
            onOpened(panel.current);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (finalFocus?.() ?? opener.current)?.focus();
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-dialog flex max-h-dvh flex-col gap-4 overflow-y-auto rounded-t-lg bg-card p-card-padding',
            'text-card-foreground shadow-raised',
            'lg:inset-0 lg:m-auto lg:h-fit lg:w-full lg:max-w-md lg:rounded-lg',
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <DialogPrimitive.Title className="text-h3">{children}</DialogPrimitive.Title>;
}

export function SheetDescription({ children }: { children: ReactNode }) {
  return <DialogPrimitive.Description className="text-body text-muted-foreground">{children}</DialogPrimitive.Description>;
}
