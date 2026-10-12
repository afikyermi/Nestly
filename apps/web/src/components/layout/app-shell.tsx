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
  /** The drawer body, for example MenuItems. */
  menu: ReactNode;
  topBarActions?: ReactNode;
  /** Placement only. */
  className?: string;
}

// The frame of every protected page: skip link, top bar, primary navigation (bar below 1024, rail from
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
  topBarActions,
  className,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainId = useId();

  return (
    <div className={cn('flex min-h-dvh flex-col', className)}>
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
          setDrawerOpen(true);
        }}
        actions={topBarActions}
      />
      <div className="flex flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6">
        <BottomNavigation className="order-last lg:order-none" items={navItems} label={navLabel} />
        <main
          id={mainId}
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-5 lg:mx-auto lg:max-w-2xl lg:px-0"
        >
          {children}
        </main>
      </div>
      <SideDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={drawerTitle} closeLabel={drawerCloseLabel}>
        {menu}
      </SideDrawer>
    </div>
  );
}
