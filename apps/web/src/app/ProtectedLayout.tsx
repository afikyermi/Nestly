import { useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ShareLinkSheet } from '@/components/domain/share-link-sheet';
import { AppShell } from '@/components/layout/app-shell';
import { MenuItem } from '@/components/shared/menu-item';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { NotificationsProvider, useNotifications } from '@/features/notifications/NotificationsProvider';
import { SearchBox } from '@/features/search/SearchBox';
import { BagIcon, HomeIcon, MessageIcon, NestFilledIcon, NestIcon, SparkIcon, UserIcon } from '@/components/ui/icons';
import { MARKETPLACE_NAV_LABEL } from '@/lib/marketplace-texts';
import { AccountKindProvider, useAccountKindQuery } from '@/hooks/use-account-kind';
import { usePostingProfile } from '@/hooks/use-posting-right';
import { isPlainClick } from '@/lib/is-plain-click';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import {
  BILLING_TITLE,
  CHATS_NAV_LABEL,
  DIRECTORY_NAV_LABEL,
  DIRECTORY_TITLE,
  FOLLOWING_TITLE,
  HELP_REQUESTS_TITLE,
  MY_ARTICLES,
  MY_OFFERS,
  OFFERS_TITLE,
  PROFILE_EDIT_TITLE,
  PROMOTION_TITLE,
} from '@/lib/professional-texts';
import { useBackCloses } from '@/hooks/use-back-closes';
import { useSession } from '@/hooks/use-session';
import { StaffAccessProvider, useStaffAccessQuery } from '@/hooks/use-staff-access';
import { ADMIN_MENU_LABEL, STAFF_GROUPS_MENU_LABEL } from '@/features/admin/admin-texts';
import { ChatTopBarButton } from '@/features/chat/ChatTopBarButton';
import { ChatsNavBadge } from '@/features/chat/ChatsNavBadge';
import { NEW_SUPPORT_LABEL } from '@/lib/chat-texts';
import { shareLinkSheetProps, useShareLink } from '@/hooks/use-share-link';
import { SHARE_SITE_LABEL } from '@/lib/share-link-texts';
import { RULES_TITLE } from '@/pages/community-rules/community-rules-texts';
import { HOTLINES_TITLE } from '@/pages/medical-hotlines/medical-hotlines-texts';
import { parseSettingsSection, SETTINGS_SECTIONS, settingsSectionHash, STAFF_SETTINGS_SECTIONS } from '@/lib/settings-sections';
import { DesktopShortcuts } from './DesktopShortcuts';
import { normalizePath, PATHS } from './paths';

// The destinations of a community account (AC-005, §7.1, in the sketch's order): home, the Marketplace (I12, "חנות", FR-MKT-001), feed, the
// Professionals' directory (I11, FR-SERV-001) and the profile. The profile tab shows the generic person icon until profile photos exist (I5, Q7). A
// Professional's (§11.20, Afik 21.10.2026; AC-148): home (its dashboard), feed, its conversations with the unread badge (below 1024 only: from
// 1024 the top bar's Chat Center button is beside the row, redesign 27.10.2026), and its
// Professional profile (no "חנות" in the bar: I12-B puts it in its menu, view and contact only; "בקשות עזרה" is reached from its home and its menu).
// A staff account (I14 completion, Afik 21.10.2026): home (the admin area), the Marketplace, the feed and the directory, for review; no personal
// profile (a work-only account).
const navItems = (professional: boolean, staff = false) => [
  { key: 'home', label: 'בית', href: staff ? PATHS.admin : PATHS.home, icon: <HomeIcon />, currentIcon: <HomeIcon className="fill-current" /> },
  ...(professional ? [] : [{ key: 'marketplace', label: MARKETPLACE_NAV_LABEL, href: PATHS.marketplace, icon: <BagIcon />, currentIcon: <BagIcon className="fill-current" /> }]),
  { key: 'feed', label: 'פיד', href: PATHS.feed, icon: <NestIcon />, currentIcon: <NestFilledIcon /> },
  professional
    ? { key: 'chats', label: CHATS_NAV_LABEL, href: PATHS.chat, icon: <MessageIcon />, currentIcon: <MessageIcon className="fill-current" />, badge: <ChatsNavBadge />, desktopHidden: true }
    : { key: 'services', label: DIRECTORY_NAV_LABEL, href: PATHS.services, icon: <SparkIcon />, currentIcon: <SparkIcon className="fill-current" /> },
  // From 1024 the profile is the avatar at the end of the top bar (redesign 27.10.2026), not an icon in the row.
  ...(staff ? [] : [{ key: 'profile', label: 'פרופיל', href: professional ? PATHS.proProfile : PATHS.profile, icon: <UserIcon />, currentIcon: <UserIcon className="fill-current" />, desktopHidden: true }]),
];

/**
 * The account's avatar at the end of the top bar from 1024 (redesign 27.10.2026, §7.3): a link to its profile, named like the navigation's
 * "פרופיל" (hidden text). The initials come from the own-profile answer the feed and the composer already ask for (one request in flight is shared); a
 * Professional, with no parent profile, gets the person icon. Staff have no profile and no avatar.
 */
function TopBarAvatar({ href, current, onNavigate }: { href: string; current: boolean; onNavigate: (href: string) => void }) {
  const { fullName } = usePostingProfile();
  return (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate(href);
      }}
      className={cn('ms-1 hidden size-11 shrink-0 place-items-center rounded-full no-underline hover:bg-primary-strong lg:grid', current && 'bg-primary-strong')}
    >
      {/* The name is text (not aria-label), so it never contradicts the initials a sighted user sees (WCAG 2.5.3) */}
      <span className="sr-only">פרופיל</span>
      <Avatar name={fullName ?? ''} decorative size="s" className="ring-2 ring-primary-foreground" />
    </a>
  );
}

/** The top bar's search (AC-033): a Regular or Professional account only. An Admin or Moderator account has none. */
function TopBarSearch() {
  const { state } = useNotifications();
  return state.kind === 'unavailable' ? null : <SearchBox />;
}

/** The top bar's bell (AC-033), after the Chat Center's button (I8, FR-CHAT-001: given only to a community account, BR-034). */
function TopBarActions({ chat }: { chat: ReactNode }) {
  const { state } = useNotifications();
  if (state.kind === 'unavailable') return chat === null ? null : <>{chat}</>;
  return (
    <>
      {chat}
      <NotificationBell />
    </>
  );
}

// The AppShell around every protected screen (FR-TOP-001, FR-MENU-001), bound to the router and the
// session. The TopBar holds the Hamburger, the Logo, the search and the notifications bell (AC-033; not for staff accounts); the menu holds My Groups (I10, PG-033), Friends (F2.4b), the community rules (F3.7, PG-049), one item per Settings section (F2.5),
// the medical hotlines page (F3.8, FR-MENU-001 order), the recovery questions, the password change (F2.0 c15), "שיתוף Nestly" (F3.6 c11: the
// site link's window, for Regular and Professional alike; no post data) and Logout. A destination whose feature is not built is absent, not
// disabled (F2.5 DR-1, as the bottom navigation does for "חנות" and "יועצים").
export function ProtectedLayout() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const staff = useStaffAccessQuery();
  const kind = useAccountKindQuery();
  const professional = kind === 'professional';
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
    <StaffAccessProvider value={staff}>
    <AccountKindProvider value={kind}>
    <NotificationsProvider>
    <AppShell
      topBarSearch={<TopBarSearch />}
      topBarAvatar={
        staff.kind === 'staff' ? null : (
          <TopBarAvatar href={professional ? PATHS.proProfile : PATHS.profile} current={current === (professional ? PATHS.proProfile : PATHS.profile)} onNavigate={go} />
        )
      }
      shortcuts={<DesktopShortcuts kind={staff.kind === 'staff' ? 'staff' : professional ? 'professional' : 'regular'} current={current} onNavigate={go} />}
      topBarActions={<TopBarActions chat={staff.kind === 'none' ? <ChatTopBarButton current={current} /> : null} />}
      navItems={navItems(professional, staff.kind === 'staff').map((item) => ({
        ...item,
        current: item.href === current || (item.key === 'chats' && current.startsWith(`${PATHS.chat}/`)),
      }))}
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
          {/* I14 completion: a staff account opens the Groups for review (it joins none). */}
          <MenuItem href={PATHS.groups} current={current === PATHS.groups || current.startsWith(`${PATHS.groups}/`)} onNavigate={leaving(closeMenu)}>
            {staff.kind === 'staff' ? STAFF_GROUPS_MENU_LABEL : 'הקבוצות שלי'}
          </MenuItem>
          {/* A Professional has no Friends (Afik 21.10.2026, §9.8): its menu has the business items below instead. Staff have none either. */}
          {professional || staff.kind === 'staff' ? null : (
            <MenuItem href={PATHS.friends} current={PATHS.friends === current} onNavigate={leaving(closeMenu)}>
              חברים
            </MenuItem>
          )}
          {staff.kind === 'staff' ? (
            <MenuItem href={PATHS.admin} current={current.startsWith(PATHS.admin)} onNavigate={leaving(closeMenu)}>
              {ADMIN_MENU_LABEL}
            </MenuItem>
          ) : null}
          <MenuItem href={PATHS.communityRules} current={PATHS.communityRules === current} onNavigate={leaving(closeMenu)}>
            {RULES_TITLE}
          </MenuItem>
          {/* I11: for a Professional (Afik 21.10.2026, §9.8) its profile, articles, offers, promotion and results, billing, the Professionals it
              follows and the directory; for a Regular user the directory, Offer Help (FR-SERV-001/005/006) and the Professionals it follows (PG-039). */}
          {professional ? (
            <>
              <MenuItem href={PATHS.proProfile} current={PATHS.proProfile === current} onNavigate={leaving(closeMenu)}>
                {PROFILE_EDIT_TITLE}
              </MenuItem>
              <MenuItem href={PATHS.proArticles} current={PATHS.proArticles === current} onNavigate={leaving(closeMenu)}>
                {MY_ARTICLES}
              </MenuItem>
              <MenuItem href={PATHS.offers} current={PATHS.offers === current} onNavigate={leaving(closeMenu)}>
                {MY_OFFERS}
              </MenuItem>
              {/* §11.20: out of the bottom navigation, reached from here and the home */}
              <MenuItem href={PATHS.helpRequests} current={PATHS.helpRequests === current} onNavigate={leaving(closeMenu)}>
                {HELP_REQUESTS_TITLE}
              </MenuItem>
              {/* I12-B (Afik §10.5): "חנות" for a Professional — view and contact only; its bottom navigation stays §11.20 */}
              <MenuItem href={PATHS.marketplace} current={current === PATHS.marketplace || current.startsWith(`${PATHS.marketplace}/`)} onNavigate={leaving(closeMenu)}>
                {MARKETPLACE_NAV_LABEL}
              </MenuItem>
              <MenuItem href={PATHS.proPromotion} current={PATHS.proPromotion === current} onNavigate={leaving(closeMenu)}>
                {PROMOTION_TITLE}
              </MenuItem>
              <MenuItem href={PATHS.proBilling} current={PATHS.proBilling === current} onNavigate={leaving(closeMenu)}>
                {BILLING_TITLE}
              </MenuItem>
            </>
          ) : null}
          {staff.kind === 'none' ? (
            <MenuItem href={PATHS.following} current={PATHS.following === current} onNavigate={leaving(closeMenu)}>
              {FOLLOWING_TITLE}
            </MenuItem>
          ) : null}
          {staff.kind === 'none' ? (
            <MenuItem href={PATHS.services} current={PATHS.services === current} onNavigate={leaving(closeMenu)}>
              {DIRECTORY_TITLE}
            </MenuItem>
          ) : null}
          {staff.kind === 'none' && !professional ? (
            <MenuItem href={PATHS.offers} current={PATHS.offers === current} onNavigate={leaving(closeMenu)}>
              {OFFERS_TITLE}
            </MenuItem>
          ) : null}
          {(staff.kind === 'staff' ? STAFF_SETTINGS_SECTIONS : SETTINGS_SECTIONS).map((section) => (
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
          {/* I8: the Support form (FR-ADMIN-001, FR-MENU-001 "Help/Support Request"), for a community account; staff send none. */}
          {staff.kind === 'none' ? (
            <MenuItem href={PATHS.support} current={PATHS.support === current} onNavigate={leaving(closeMenu)}>
              {NEW_SUPPORT_LABEL}
            </MenuItem>
          ) : null}
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
    </AccountKindProvider>
    </StaffAccessProvider>
  );
}
