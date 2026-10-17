import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BottomNavigation, type BottomNavigationProps } from '../shared/bottom-navigation';
import { SideDrawer } from '../shared/side-drawer';
import { TopBar } from '../shared/top-bar';

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
   * screen (navigates, signs out): the drawer closes and focus moves to `main`, not back to the Hamburger.
   */
  menu: ReactNode | ((closeMenu: () => void) => ReactNode);
  /** Passed to the navigation: called with an item's href on a plain click (client-side routing). */
  onNavigate?: ((href: string) => void) | undefined;
  topBarActions?: ReactNode;
  /** Placement only. */
  className?: string;
}

// Below 1024 the frame is one screen high and `main` scrolls inside it, so the bottom bar sits under the content and never over it
// (WCAG 2.5.8: nothing a user can press is covered by the bar). The frame of every protected page: skip link, top bar, primary navigation (bar below 1024, rail from
// 1024), one main landmark, and the side drawer the Hamburger opens. It knows nothing about routing,
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
  onNavigate,
  topBarActions,
  className,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  return (
    <div className={cn('flex h-dvh flex-col lg:h-auto lg:min-h-dvh', className)}>
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
        actions={topBarActions}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:min-h-fit lg:flex-row lg:gap-6 lg:px-6">
        <BottomNavigation
          className="order-last lg:order-none"
          items={navItems}
          label={navLabel}
          onNavigate={onNavigate}
        />
        <main
          id={mainId}
          ref={mainRef}
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:mx-auto lg:max-w-2xl lg:overflow-visible lg:px-0"
        >
          {children}
        </main>
      </div>
      <SideDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={drawerTitle}
        closeLabel={drawerCloseLabel}
        finalFocus={() => {
          if (!focusMainOnClose.current) return null;
          // A screen that puts focus on a heading of its own marks it, and keeps it over `main`.
          return mainRef.current?.querySelector<HTMLElement>('[data-initial-focus]') ?? mainRef.current;
        }}
      >
        {typeof menu === 'function' ? menu(closeMenu) : menu}
      </SideDrawer>
    </div>
  );
}
