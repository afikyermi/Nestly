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
        <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-foreground/45" />
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
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-foreground/45" onClick={() => onOpenChange(false)} />
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
            'fixed inset-x-4 top-1/2 z-dialog mx-auto flex max-w-sm -translate-y-1/2 flex-col gap-4 rounded-xl bg-card p-card-padding',
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
// bottom sheet (top corners 20 and a grab handle), from 1024 px a small window in the middle. role="dialog", aria-modal, portaled over a 45%
// dark backdrop that blurs the page by 4 px; a focus trap, the page scroll locked and the rest of the page inert (Radix Dialog). Escape and a press outside close it (onOpenChange(false));
// Back is the screen's (useBackCloses), since only the screen owns the history. Controlled: the element focused when it opened is remembered
// and given focus back when it closes, unless `finalFocus` names another.
/**
 * The focus of a controlled panel: as it opens, the element focused before is remembered and `onOpened` (when given) moves focus in instead of
 * Radix's first focusable; as it closes, focus goes to `finalFocus` or back to that element. Shared by SheetPanel and ChatWindowPanel.
 */
function usePanelFocus(onOpened: ((panel: HTMLElement) => void) | undefined, finalFocus: (() => HTMLElement | null) | undefined) {
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  return {
    ref: panel,
    onOpenAutoFocus: (event: Event) => {
      // Runs before Radix moves focus in, so the active element is still the opener.
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (onOpened === undefined || panel.current === null) return;
      event.preventDefault();
      onOpened(panel.current);
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      (finalFocus?.() ?? opener.current)?.focus();
    },
  };
}

export function SheetPanel({ open, onOpenChange, children, described = true, onOpened, finalFocus }: SheetPanelProps) {
  const focus = usePanelFocus(onOpened, finalFocus);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-foreground/45 backdrop-blur-xs" />
        <DialogPrimitive.Content
          {...focus}
          aria-modal="true"
          {...(described ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-dialog flex max-h-dvh flex-col gap-4 overflow-y-auto rounded-t-xl bg-card px-4 pt-2 pb-6',
            'text-card-foreground shadow-sheet',
            'lg:inset-0 lg:m-auto lg:h-fit lg:w-full lg:max-w-md lg:rounded-xl lg:p-card-padding',
          )}
        >
          {/* The grab handle: a phone-sheet mark only, not a control (Escape, a press outside or the sheet's own cancel close it). */}
          <div aria-hidden="true" className="mx-auto -mb-1 h-1.5 w-10 shrink-0 rounded-full bg-divider lg:hidden" />
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <DialogPrimitive.Title className="text-center text-h3 lg:text-start">{children}</DialogPrimitive.Title>;
}

export function SheetDescription({ children }: { children: ReactNode }) {
  return <DialogPrimitive.Description className="text-body text-muted-foreground">{children}</DialogPrimitive.Description>;
}

interface ChatWindowPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The window body: a ChatWindowTitle (the dialog's name) and a ChatWindowDescription. */
  children: ReactNode;
  /** Called as the window opens, with the window: the caller moves focus in. */
  onOpened?: ((panel: HTMLElement) => void) | undefined;
  /** Where focus goes when the window closes. Unset, or returning null: the element focused when it opened. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// A conversation window over the screen (the Nestly assistant, Afik 28.10.2026): below 1024 px it fills the screen; from 1024 px a window of
// 24rem at the bottom inline-start corner (bottom right in Hebrew), over a light backdrop, so the page stays in view. role="dialog", aria-modal,
// a focus trap, Escape and a press outside close it (Radix Dialog); Back is the caller's (useBackCloses). Controlled, like SheetPanel.
export function ChatWindowPanel({ open, onOpenChange, children, onOpened, finalFocus }: ChatWindowPanelProps) {
  const focus = usePanelFocus(onOpened, finalFocus);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-foreground/45 lg:bg-foreground/15" />
        <DialogPrimitive.Content
          {...focus}
          aria-modal="true"
          className={cn(
            'fixed inset-0 z-dialog flex h-dvh flex-col bg-card text-card-foreground',
            'lg:inset-auto lg:start-6 lg:top-24 lg:bottom-6 lg:mt-auto lg:h-auto lg:max-h-160 lg:w-96 lg:rounded-xl lg:border lg:border-border lg:shadow-sheet',
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ChatWindowTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Title className={cn('text-h3', className)}>{children}</DialogPrimitive.Title>;
}

export function ChatWindowDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Description className={cn('text-small text-muted-foreground', className)}>{children}</DialogPrimitive.Description>;
}
