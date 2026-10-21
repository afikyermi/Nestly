import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { TITLE } from '@/features/notifications/notification-texts';
import { documentTitle } from '@/lib/document-title';

// The notifications page (PG-018, FR-NOTIF-001), reached from the bell's "כל ההתראות". The page only composes.
export function NotificationsPage() {
  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div className="mt-5">
        <NotificationsScreen />
      </div>
    </>
  );
}
