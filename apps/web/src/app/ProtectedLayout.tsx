import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { MenuItem } from '@/components/shared/menu-item';
import { HomeIcon, NestIcon, UserIcon } from '@/components/ui/icons';
import { useSession } from '@/hooks/use-session';
import { normalizePath, PATHS } from './paths';

// The three MVP destinations of a Regular user (AC-005, §7.1). The profile tab shows the generic person
// icon until profile photos exist (I5, Q7). "חנות" and "יועצים" are absent, not disabled.
const NAV_ITEMS = [
  { key: 'home', label: 'בית', href: PATHS.home, icon: <HomeIcon /> },
  { key: 'feed', label: 'פיד', href: PATHS.feed, icon: <NestIcon /> },
  { key: 'profile', label: 'פרופיל', href: PATHS.profile, icon: <UserIcon /> },
];

// The AppShell around every protected screen (FR-TOP-001, FR-MENU-001), bound to the router and the
// session. The TopBar holds only the Hamburger and the Logo; the menu holds Settings and Logout.
export function ProtectedLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const current = normalizePath(pathname);
  // A click on the screen already open replaces its entry instead of stacking a duplicate.
  const go = (href: string) => {
    void navigate(href, { replace: href === current });
  };

  return (
    <AppShell
      navItems={NAV_ITEMS.map((item) => ({ ...item, current: item.href === current }))}
      navLabel="ניווט ראשי"
      menuLabel="פתיחת התפריט"
      drawerTitle="תפריט"
      drawerCloseLabel="סגירת התפריט"
      skipLinkLabel="דילוג לתוכן הראשי"
      onNavigate={go}
      menu={(closeMenu) => (
        <>
          <MenuItem
            href={PATHS.settings}
            onNavigate={(href) => {
              closeMenu();
              go(href);
            }}
          >
            הגדרות
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              void signOut();
            }}
          >
            התנתקות
          </MenuItem>
        </>
      )}
    >
      <Outlet />
    </AppShell>
  );
}
