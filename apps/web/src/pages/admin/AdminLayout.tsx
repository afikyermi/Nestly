import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router';
import type { PermissionKey, StaffInbox } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { documentTitle } from '@/lib/document-title';
import { useAdminCall } from '@/hooks/use-admin-call';
import { useStaffAccess } from '@/hooks/use-staff-access';
import { fetchInbox } from '@/services/api/team';
import { INBOX_BADGE } from '@/features/admin/team-texts';
import { AdminHomeScreen } from '@/features/admin/AdminHomeScreen';
import { MyWorkScreen } from '@/features/admin/MyWorkScreen';
import { ADMIN_HOME_TITLE, MY_WORK_TITLE } from '@/features/admin/staff-work-texts';
import { ADMIN_NAV_LABEL, ADMIN_TITLE, LOADING_TEXT, TAB_KEYS, TAB_LABELS, type AdminTab } from '@/features/admin/admin-texts';

/** What the admin pages read from the layout: the keys the account holds (presentation only; the database decides). */
export interface AdminContext {
  permissions: readonly PermissionKey[];
}

/** The tabs built so far, with their paths. */
export const ADMIN_TABS: ReadonlyArray<{ tab: AdminTab; path: string }> = [
  // I14 completion (§9.6): the staff home: the Admin's home, or a Moderator's "my work"
  { tab: 'home', path: PATHS.admin },
  { tab: 'reports', path: PATHS.adminReports },
  { tab: 'users', path: PATHS.adminUsers },
  { tab: 'audit', path: PATHS.adminAudit },
  { tab: 'support', path: PATHS.adminSupport },
  { tab: 'guides', path: PATHS.adminGuides },
  { tab: 'media', path: PATHS.adminMedia },
  { tab: 'team', path: PATHS.adminTeam },
  { tab: 'community', path: PATHS.adminCommunity },
  { tab: 'announcements', path: PATHS.adminAnnouncements },
  { tab: 'analytics', path: PATHS.adminAnalytics },
  { tab: 'childData', path: PATHS.adminChildData },
  { tab: 'marketplace', path: PATHS.adminMarketplace },
  { tab: 'sponsored', path: PATHS.adminSponsored },
  { tab: 'promotions', path: PATHS.adminPromotions },
];

/** AC-044: what waits on a tab, from the staff inbox (an area the keys do not cover is absent, so no badge). */
function waiting(tab: AdminTab, inbox: StaffInbox): number {
  if (tab === 'reports') return inbox.openReports ?? 0;
  if (tab === 'media') return inbox.queuedImages ?? 0;
  return 0;
}

/** Whether the account's role and keys show a tab (presentation only; the database decides every call). */
export function tabAllowed(tab: AdminTab, role: 'admin' | 'moderator', permissions: readonly PermissionKey[]): boolean {
  const key = TAB_KEYS[tab];
  if (key === 'STAFF') return true;
  // the Admin's home holds the children's trends builder; the tab is a Moderator's way to it
  if (tab === 'childData' && role === 'admin') return false;
  // I13 (§11.1): promotions are stopped by the target's moderation key
  if (tab === 'promotions') return role === 'admin' || permissions.includes('CONTENT_MODERATE') || permissions.includes('MARKETPLACE_MODERATE');
  return key === 'ADMIN' ? role === 'admin' : permissions.includes(key);
}

/** The first tab the role and keys allow, for the entry `/admin`; null when none. */
export function firstTabPath(role: 'admin' | 'moderator', permissions: readonly PermissionKey[]): string | null {
  return ADMIN_TABS.find(({ tab }) => tabAllowed(tab, role, permissions))?.path ?? null;
}

// The admin shell (FR-MOD-003, FR-ADMIN-005, PG-028): a heading, one link per screen the account's keys allow, and the screen. The routes are guarded by the
// role the server reports from the database's tables; an account that is not staff goes to the feed. A UX control only: every call is checked again by the
// database. Other parts (announcements, the Moderator team) add their tabs here.
export function AdminLayout() {
  const access = useStaffAccess();
  const call = useAdminCall();
  const [inbox, setInbox] = useState<StaffInbox>({});
  const staff = access.kind === 'staff';
  // AC-044: the administrative notices, once per visit to the shell, only for the areas the keys cover (the server counts through the policies)
  useEffect(() => {
    if (!staff) return;
    let live = true;
    void call((token) => fetchInbox(token)).then((outcome) => {
      if (live && outcome.kind === 'ok') setInbox(outcome.value);
    });
    return () => {
      live = false;
    };
  }, [staff, call]);
  if (access.kind === 'loading') {
    return (
      <p role="status" className="py-6">
        {LOADING_TEXT}
      </p>
    );
  }
  if (access.kind === 'none') return <Navigate to={PATHS.feed} replace />;
  const tabs = ADMIN_TABS.filter(({ tab }) => tabAllowed(tab, access.role, access.permissions));
  const context: AdminContext = { permissions: access.permissions };
  return (
    <>
      <title>{documentTitle(ADMIN_TITLE)}</title>
      <h1 className="text-h2">{ADMIN_TITLE}</h1>
      <nav aria-label={ADMIN_NAV_LABEL} className="mt-4">
        <ul className="flex flex-wrap gap-2">
          {tabs.map(({ tab, path }) => (
            <li key={tab}>
              <NavLink
                to={path}
                end={path === PATHS.admin}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-md px-4 text-label no-underline ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary-strong'}`
                }
              >
                {tab === 'home' ? (access.role === 'admin' ? ADMIN_HOME_TITLE : MY_WORK_TITLE) : TAB_LABELS[tab]}
                {waiting(tab, inbox) > 0 ? (
                  <span className="ms-2 rounded-full bg-card px-2 text-caption text-foreground">{INBOX_BADGE(waiting(tab, inbox))}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-5">
        <Outlet context={context} />
      </div>
    </>
  );
}

/** `/admin` itself (I14 completion, §9.6): the Admin's home, or a Moderator's "my work". */
export function AdminIndex() {
  const access = useStaffAccess();
  if (access.kind !== 'staff') return null;
  const title = access.role === 'admin' ? ADMIN_HOME_TITLE : MY_WORK_TITLE;
  return (
    <>
      <title>{documentTitle(title)}</title>
      <h2 className="mb-4 text-h3">{title}</h2>
      {access.role === 'admin' ? <AdminHomeScreen /> : <MyWorkScreen />}
    </>
  );
}
