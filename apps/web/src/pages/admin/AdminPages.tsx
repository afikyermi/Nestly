import { useOutletContext } from 'react-router';
import { AuditLogScreen } from '@/features/admin/AuditLogScreen';
import { ReportsScreen } from '@/features/admin/ReportsScreen';
import { UsersScreen } from '@/features/admin/UsersScreen';
import { AUDIT_TITLE, REPORTS_TITLE, USERS_TITLE } from '@/features/admin/admin-texts';
import { documentTitle } from '@/lib/document-title';
import type { AdminContext } from './AdminLayout';

// The three admin screens, one heading each under the layout's h1. A screen shows to a key holder; the database refuses the rest.
export function AdminReportsPage() {
  const { permissions } = useOutletContext<AdminContext>();
  return (
    <>
      <title>{documentTitle(REPORTS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{REPORTS_TITLE}</h2>
      <ReportsScreen permissions={permissions} />
    </>
  );
}

export function AdminUsersPage() {
  const { permissions } = useOutletContext<AdminContext>();
  return (
    <>
      <title>{documentTitle(USERS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{USERS_TITLE}</h2>
      <UsersScreen permissions={permissions} />
    </>
  );
}

export function AdminAuditPage() {
  return (
    <>
      <title>{documentTitle(AUDIT_TITLE)}</title>
      <h2 className="mb-4 text-h3">{AUDIT_TITLE}</h2>
      <AuditLogScreen />
    </>
  );
}
