import { useOutletContext, useSearchParams } from 'react-router';
import { ChildTrendsBuilder } from '@/features/admin/ChildTrendsBuilder';
import { CHILD_TRENDS_TITLE } from '@/features/admin/staff-work-texts';
import { AnalyticsScreen } from '@/features/admin/AnalyticsScreen';
import { AnnouncementsScreen } from '@/features/admin/AnnouncementsScreen';
import { AuditLogScreen } from '@/features/admin/AuditLogScreen';
import { CommunityScreen } from '@/features/admin/CommunityScreen';
import { MarketplaceAdminScreen } from '@/features/admin/MarketplaceAdminScreen';
import { MediaQueueScreen } from '@/features/admin/MediaQueueScreen';
import { ReportsScreen } from '@/features/admin/ReportsScreen';
import { SponsoredScreen } from '@/features/admin/SponsoredScreen';
import { SupportInboxScreen } from '@/features/admin/SupportInboxScreen';
import { TeamScreen } from '@/features/admin/TeamScreen';
import { UsersScreen } from '@/features/admin/UsersScreen';
import { ANALYTICS_TITLE, ANNOUNCEMENTS_TITLE, COMMUNITY_TITLE, TEAM_TITLE } from '@/features/admin/team-texts';
import { AUDIT_TITLE, MEDIA_QUEUE_TITLE, REPORTS_TITLE, SUPPORT_TITLE, USERS_TITLE } from '@/features/admin/admin-texts';
import { documentTitle } from '@/lib/document-title';
import { ADMIN_LISTINGS_TITLE, SPONSORED_TITLE } from '@/lib/marketplace-texts';
import type { AdminContext } from './AdminLayout';

// The admin screens, one heading each under the layout's h1. A screen shows to a key holder; the database refuses the rest.
export function AdminReportsPage() {
  const { permissions } = useOutletContext<AdminContext>();
  // I14 completion: `?target=<kind>:<id>` opens one item ("next in queue")
  const [params] = useSearchParams();
  const [kind = '', id = ''] = (params.get('target') ?? '').split(':');
  const initialTarget = kind !== '' && id !== '' ? { kind, id } : null;
  return (
    <>
      <title>{documentTitle(REPORTS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{REPORTS_TITLE}</h2>
      <ReportsScreen permissions={permissions} initialTarget={initialTarget} />
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
  // I14 completion: `?sensitive=true` opens on the sensitive events (the Admin's home links here)
  const [params] = useSearchParams();
  return (
    <>
      <title>{documentTitle(AUDIT_TITLE)}</title>
      <h2 className="mb-4 text-h3">{AUDIT_TITLE}</h2>
      <AuditLogScreen initialSensitive={params.get('sensitive') === 'true'} />
    </>
  );
}

/** I14 completion (§9.2): children's tracker trends for a Moderator holding CHILD_DATA_VIEW (the Admin has them on its home). */
export function AdminChildDataPage() {
  return (
    <>
      <title>{documentTitle(CHILD_TRENDS_TITLE)}</title>
      <ChildTrendsBuilder headingLevel={2} />
    </>
  );
}

export function AdminSupportPage() {
  const { permissions } = useOutletContext<AdminContext>();
  return (
    <>
      <title>{documentTitle(SUPPORT_TITLE)}</title>
      <h2 className="mb-4 text-h3">{SUPPORT_TITLE}</h2>
      <SupportInboxScreen permissions={permissions} />
    </>
  );
}

export function AdminTeamPage() {
  return (
    <>
      <title>{documentTitle(TEAM_TITLE)}</title>
      <h2 className="mb-4 text-h3">{TEAM_TITLE}</h2>
      <TeamScreen />
    </>
  );
}

export function AdminCommunityPage() {
  return (
    <>
      <title>{documentTitle(COMMUNITY_TITLE)}</title>
      <h2 className="mb-4 text-h3">{COMMUNITY_TITLE}</h2>
      <CommunityScreen />
    </>
  );
}

export function AdminAnnouncementsPage() {
  return (
    <>
      <title>{documentTitle(ANNOUNCEMENTS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{ANNOUNCEMENTS_TITLE}</h2>
      <AnnouncementsScreen />
    </>
  );
}

export function AdminAnalyticsPage() {
  return (
    <>
      <title>{documentTitle(ANALYTICS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{ANALYTICS_TITLE}</h2>
      <AnalyticsScreen />
    </>
  );
}

export function AdminMediaPage() {
  return (
    <>
      <title>{documentTitle(MEDIA_QUEUE_TITLE)}</title>
      <h2 className="mb-4 text-h3">{MEDIA_QUEUE_TITLE}</h2>
      <MediaQueueScreen />
    </>
  );
}

export function AdminMarketplacePage() {
  return (
    <>
      <title>{documentTitle(ADMIN_LISTINGS_TITLE)}</title>
      <h2 className="mb-4 text-h3">{ADMIN_LISTINGS_TITLE}</h2>
      <MarketplaceAdminScreen />
    </>
  );
}

export function AdminSponsoredPage() {
  return (
    <>
      <title>{documentTitle(SPONSORED_TITLE)}</title>
      <h2 className="mb-4 text-h3">{SPONSORED_TITLE}</h2>
      <SponsoredScreen />
    </>
  );
}
