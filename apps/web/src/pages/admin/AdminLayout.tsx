import { NavLink, Navigate, Outlet } from 'react-router';
import type { PermissionKey } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { documentTitle } from '@/lib/document-title';
import { useStaffAccess } from '@/hooks/use-staff-access';
import { ADMIN_NAV_LABEL, ADMIN_NO_SCREENS_TEXT, ADMIN_TITLE, LOADING_TEXT, TAB_KEYS, TAB_LABELS, type AdminTab } from '@/features/admin/admin-texts';

/** What the admin pages read from the layout: the keys the account holds (presentation only; the database decides). */
export interface AdminContext {
  permissions: readonly PermissionKey[];
}

/** The tabs built so far, with their paths. */
export const ADMIN_TABS: ReadonlyArray<{ tab: AdminTab; path: string }> = [
  { tab: 'reports', path: PATHS.adminReports },
  { tab: 'users', path: PATHS.adminUsers },
  { tab: 'audit', path: PATHS.adminAudit },
  { tab: 'guides', path: PATHS.adminGuides },
  { tab: 'media', path: PATHS.adminMedia },
];

/** Whether the account's role and keys show a tab (presentation only; the database decides every call). */
export function tabAllowed(tab: AdminTab, role: 'admin' | 'moderator', permissions: readonly PermissionKey[]): boolean {
  const key = TAB_KEYS[tab];
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
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-md px-4 text-label no-underline ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary-strong'}`
                }
              >
                {TAB_LABELS[tab]}
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

/** `/admin` itself: the first screen the keys allow. */
export function AdminIndex() {
  const access = useStaffAccess();
  if (access.kind !== 'staff') return null;
  const target = firstTabPath(access.role, access.permissions);
  return target === null ? <p>{ADMIN_NO_SCREENS_TEXT}</p> : <Navigate to={target} replace />;
}
