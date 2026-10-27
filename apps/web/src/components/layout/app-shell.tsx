import { createContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BottomNavigation, type BottomNavigationProps } from '../shared/bottom-navigation';
import { SideDrawer } from '../shared/side-drawer';
import { TopBar } from '../shared/top-bar';

/**
 * The shell's action bar: an element a screen may portal one floating action into ("חזרה למעלה", F3.2b c20). Below 1024 it is a row of its own
 * between `main` and the bottom bar, so it never covers anything in `main`; from 1024 it is fixed 24 px from the inline-end edge, in the gutter
 * beside the centred column (at 1024 px the gutter is 116 px: what goes in it must fit, e.g. an icon only while the shell, a size
 * container, is narrower than 72rem; the tokens define no xl breakpoint). Empty, it takes no space. Null outside a shell.
 */
export const ShellActionBarContext = createContext<HTMLElement | null>(null);

export interface AppShellProps {
  /** The page, rendered inside `main`. */
  children: ReactNode;
  navItems: BottomNavigationProps['items'];
  navLabel: string;
  menuLabel: string;
  drawerTitle: string;
  drawerCloseLabel: string;
  skipLinkLabel: string;
  /**
   * The drawer body, for example MenuItems. As a function it receives `closeMenu`, for an item that changes the
   * screen (navigates, signs out): the drawer closes and focus moves to `main`, not back to the Hamburger. And
   * `closeMenuThen`, for an item that opens a window over the screen (F3.6 "שיתוף Nestly"): the drawer closes, focus
   * goes back to the Hamburger, and only then `then` runs, so the window opens from the Hamburger and returns focus to it.
   */
  menu: ReactNode | ((closeMenu: () => void, closeMenuThen: (then: () => void) => void) => ReactNode);
  /** The drawer's state when the caller owns it (the router-aware layout closes it on Back); unset: the shell keeps its own. */
  menuOpen?: boolean | undefined;
  /** The drawer opened or closed (any way: the Hamburger, its close control, Escape, a press outside, an item). */
  onMenuOpenChange?: ((open: boolean) => void) | undefined;
  /** Passed to the navigation: called with an item's href on a plain click (client-side routing). */
  onNavigate?: ((href: string) => void) | undefined;
  /** The global search, handed to the TopBar (an icon below 1024, a field beside the logo from 1024). */
  topBarSearch?: ReactNode;
  topBarActions?: ReactNode;
  /**
   * The shortcuts column at the inline-start edge (redesign 27.10.2026, NFR-USE-001), shown from 1152 (72rem), where it fits beside the
   * centred column and the gutter the action bar uses; below that its places are in the menu.
   */
  shortcuts?: ReactNode;
  /** Below 1024 `main` scrolls inside the frame: when this changes (the route's path, not its hash) `main` goes back to the top. */
  scrollResetKey?: string | undefined;
  /** Placement only. */
  className?: string;
}

// Below 1024 the frame is one screen high and `main` scrolls inside it, so the bottom bar sits under the content and never over it
// (WCAG 2.5.8: nothing a user can press is covered by the bar). The frame of every protected page: skip link, top bar, primary navigation (bar below 1024, icons in
// the middle of the top bar from 1024), from 1024 a shortcuts column at the start, one main landmark, and the side drawer the Hamburger opens. It knows nothing about routing,
// auth or data: the route guard wraps it, and the caller passes links and copy in.
export function AppShell({
  children,
  navItems,
  navLabel,
  menuLabel,
  drawerTitle,
  drawerCloseLabel,
  skipLinkLabel,
  menu,
  menuOpen,
  onMenuOpenChange,
  onNavigate,
  topBarSearch,
  topBarActions,
  shortcuts,
  scrollResetKey,
  className,
}: AppShellProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const drawerOpen = menuOpen ?? ownOpen;
  const setDrawerOpen = (next: boolean) => {
    setOwnOpen(next);
    onMenuOpenChange?.(next);
  };
  const [actionBar, setActionBar] = useState<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Set by closeMenu, read when the drawer closes: Escape, the close control and the backdrop keep
  // returning focus to the Hamburger.
  const focusMainOnClose = useRef(false);
  const mainId = useId();
  const closeMenu = () => {
    focusMainOnClose.current = true;
    setDrawerOpen(false);
  };
  const afterClose = useRef<(() => void) | null>(null);
  const closeMenuThen = (then: () => void) => {
    focusMainOnClose.current = false;
    afterClose.current = then;
    setDrawerOpen(false);
  };

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [scrollResetKey]);

  // On a direct load focus is on `body` and, below 1024, the document no longer scrolls: `main` does. Focus stays where the browser
  // put it (the skip link must be the first Tab stop), and the first scroll key moves it to `main` so that key scrolls the content.
  useEffect(() => {
    const scrollKeys = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp']);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (!scrollKeys.has(event.key)) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      mainRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={cn('@container flex h-dvh flex-col print:h-auto lg:h-auto lg:min-h-dvh', className)}>
      <a
        href={`#${mainId}`}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="fixed start-2 top-2 z-dialog inline-flex min-h-11 -translate-y-20 items-center rounded-md bg-primary px-5 text-label text-primary-foreground no-underline focus:translate-y-0"
      >
        {skipLinkLabel}
      </a>
      <TopBar
        className="sticky top-0 z-sticky"
        menuLabel={menuLabel}
        menuButtonRef={menuButtonRef}
        onMenuClick={() => {
          // Safari and Firefox on macOS do not focus a clicked button. The drawer returns focus to the
          // element focused when it opened, so the Hamburger is focused here, before it opens.
          menuButtonRef.current?.focus();
          focusMainOnClose.current = false;
          setDrawerOpen(true);
        }}
        search={topBarSearch}
        actions={topBarActions}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:min-h-fit lg:flex-row lg:gap-6 lg:px-6 lg:pt-5">
        <BottomNavigation
          className="order-last lg:order-none"
          items={navItems}
          label={navLabel}
          onNavigate={onNavigate}
        />
        {shortcuts === undefined ? null : (
          <div className="sticky top-21 hidden w-60 shrink-0 self-start @6xl:block @7xl:w-72">{shortcuts}</div>
        )}
        <main
          id={mainId}
          ref={mainRef}
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 scroll-py-4 overflow-y-auto px-4 py-5 print:overflow-visible lg:mx-auto lg:max-w-2xl lg:overflow-visible lg:px-0 lg:pt-0"
        >
          <ShellActionBarContext value={actionBar}>{children}</ShellActionBarContext>
        </main>
        {shortcuts === undefined ? null : <div aria-hidden="true" className="hidden w-72 shrink-0 @7xl:block" />}
        <div ref={setActionBar} className="flex justify-end px-4 py-2 empty:hidden lg:fixed lg:end-6 lg:bottom-6 lg:z-sticky lg:p-0" />
      </div>
      <SideDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={drawerTitle}
        closeLabel={drawerCloseLabel}
        finalFocus={() => {
          const then = afterClose.current;
          if (then !== null) {
            // Runs right after the drawer has given focus back to the Hamburger.
            afterClose.current = null;
            queueMicrotask(then);
            return menuButtonRef.current;
          }
          if (!focusMainOnClose.current) return null;
          // A screen that puts focus on a heading of its own marks it, and keeps it over `main`.
          return mainRef.current?.querySelector<HTMLElement>('[data-initial-focus]') ?? mainRef.current;
        }}
      >
        {typeof menu === 'function' ? menu(closeMenu, closeMenuThen) : menu}
      </SideDrawer>
    </div>
  );
}
