import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ShareLinkSheet } from '@/components/domain/share-link-sheet';
import { AppShell } from '@/components/layout/app-shell';
import { MenuItem } from '@/components/shared/menu-item';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { NotificationsProvider } from '@/features/notifications/NotificationsProvider';
import { SearchBox } from '@/features/search/SearchBox';
import { HomeIcon, NestIcon, UserIcon } from '@/components/ui/icons';
import { useBackCloses } from '@/hooks/use-back-closes';
import { useSession } from '@/hooks/use-session';
import { shareLinkSheetProps, useShareLink } from '@/hooks/use-share-link';
import { SHARE_SITE_LABEL } from '@/lib/share-link-texts';
import { RULES_TITLE } from '@/pages/community-rules/community-rules-texts';
import { HOTLINES_TITLE } from '@/pages/medical-hotlines/medical-hotlines-texts';
import { parseSettingsSection, SETTINGS_SECTIONS, settingsSectionHash } from '@/lib/settings-sections';
import { normalizePath, PATHS } from './paths';

// The three MVP destinations of a Regular user (AC-005, §7.1). The profile tab shows the generic person
// icon until profile photos exist (I5, Q7). "חנות" and "יועצים" are absent, not disabled.
const NAV_ITEMS = [
  { key: 'home', label: 'בית', href: PATHS.home, icon: <HomeIcon /> },
  { key: 'feed', label: 'פיד', href: PATHS.feed, icon: <NestIcon /> },
  { key: 'profile', label: 'פרופיל', href: PATHS.profile, icon: <UserIcon /> },
];

// The AppShell around every protected screen (FR-TOP-001, FR-MENU-001), bound to the router and the
// session. The TopBar holds only the Hamburger and the Logo; the menu holds Friends (F2.4b), the community rules (F3.7, PG-049), one item per Settings section (F2.5),
// the medical hotlines page (F3.8, FR-MENU-001 order), the recovery questions, the password change (F2.0 c15), "שיתוף Nestly" (F3.6 c11: the
// site link's window, for Regular and Professional alike; no post data) and Logout. A destination whose feature is not built is absent, not
// disabled (F2.5 DR-1, as the bottom navigation does for "חנות" and "יועצים").
export function ProtectedLayout() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const current = normalizePath(pathname);
  // The Settings section open now (a section's address is the hash of the Settings path), or null.
  const openSection = current === PATHS.settings ? parseSettingsSection(hash) : null;
  const here = openSection === null ? current : `${current}${settingsSectionHash(openSection)}`;
  // A click on the screen already open replaces its entry instead of stacking a duplicate.
  const go = (href: string) => {
    void navigate(href, { replace: href === here });
  };
  // F3.6 c11: the site link's window, over whatever screen is open; Back, Escape, a press outside or "סגירה" close it onto the Hamburger.
  const shareLink = useShareLink();
  // The side menu and that window share the one history entry: Back closes either and stays (direction.md; ux-polish-b c6). Between the press on
  // "שיתוף Nestly" and the window opening (the menu hands focus back first) the entry is kept by `openingSite`.
  const [menuOpen, setMenuOpen] = useState(false);
  const [openingSite, setOpeningSite] = useState(false);
  const { leaveTo, closeThen } = useBackCloses(menuOpen || openingSite || shareLink.sheet !== null, () => {
    setMenuOpen(false);
    setOpeningSite(false);
    shareLink.close();
    return true;
  });
  // A menu item that changes the screen closes the drawer first and takes the menu's entry as its own, so Back from there returns to this screen
  // with no menu open. The screen already open: only the menu closes.
  const leaving = (closeMenu: () => void) => (href: string) => {
    closeMenu();
    if (href !== here) leaveTo(href);
  };

  return (
    <NotificationsProvider>
    <AppShell
      topBarActions={
        <>
          <SearchBox />
          <NotificationBell />
        </>
      }
      navItems={NAV_ITEMS.map((item) => ({ ...item, current: item.href === current }))}
      navLabel="ניווט ראשי"
      menuLabel="פתיחת התפריט"
      drawerTitle="תפריט"
      drawerCloseLabel="סגירת התפריט"
      skipLinkLabel="דילוג לתוכן הראשי"
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onNavigate={go}
      scrollResetKey={current}
      menu={(closeMenu, closeMenuThen) => (
        <>
          <MenuItem href={PATHS.friends} current={PATHS.friends === current} onNavigate={leaving(closeMenu)}>
            חברים
          </MenuItem>
          <MenuItem href={PATHS.communityRules} current={PATHS.communityRules === current} onNavigate={leaving(closeMenu)}>
            {RULES_TITLE}
          </MenuItem>
          {SETTINGS_SECTIONS.map((section) => (
            <MenuItem
              key={section.id}
              href={`${PATHS.settings}${settingsSectionHash(section.id)}`}
              current={openSection === section.id}
              onNavigate={leaving(closeMenu)}
            >
              {section.label}
            </MenuItem>
          ))}
          <MenuItem href={PATHS.medicalHotlines} current={PATHS.medicalHotlines === current} onNavigate={leaving(closeMenu)}>
            {HOTLINES_TITLE}
          </MenuItem>
          <MenuItem href={PATHS.recoveryQuestions} current={PATHS.recoveryQuestions === current} onNavigate={leaving(closeMenu)}>
            שאלות לשחזור סיסמה
          </MenuItem>
          <MenuItem href={PATHS.changePassword} current={PATHS.changePassword === current} onNavigate={leaving(closeMenu)}>
            החלפת סיסמה
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpeningSite(true);
              closeMenuThen(() => {
                shareLink.openSite();
                setOpeningSite(false);
              });
            }}
          >
            {SHARE_SITE_LABEL}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              // The menu's entry goes first, so sign-out starts from the screen's own entry, as it did before the menu had one.
              closeThen(() => void signOut());
            }}
          >
            התנתקות
          </MenuItem>
        </>
      )}
    >
      <Outlet />
      {shareLink.sheet !== null ? <ShareLinkSheet {...shareLinkSheetProps(shareLink, shareLink.sheet, SHARE_SITE_LABEL)} /> : null}
    </AppShell>
    </NotificationsProvider>
  );
}
