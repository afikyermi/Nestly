import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { JourneyCard } from '@/components/domain/journey-row';
import { ShellEndColumnContext } from '@/components/layout/app-shell';
import { RecentChatsCard } from '@/features/chat/RecentChatsCard';
import { FeedScreen } from '@/features/posts/FeedScreen';
import { StoriesTray } from '@/features/stories/StoriesTray';
import { FEED_TITLE } from '@/features/posts/posts-texts';
import { useAccountKind } from '@/hooks/use-account-kind';
import { useJourneyContexts } from '@/hooks/use-journey-contexts';
import { useStaffAccess } from '@/hooks/use-staff-access';
import { documentTitle } from '@/lib/document-title';

// The feed page (protected; FR-FEED-001, F3.2b): the document title and the feed screen, with the Stories tray (FR-FEED-008) at its top. On a wide
// desktop (redesign 27.10.2026, NFR-USE-001) the shell's end column holds "המסע שלי" (a Regular account's journeys, the same answer as the feed's
// journey row) and "שיחות אחרונות" (a community account's; staff have no chat).
export function FeedPage() {
  const endColumn = useContext(ShellEndColumnContext);
  const navigate = useNavigate();
  const staff = useStaffAccess().kind === 'staff';
  const regular = useAccountKind() === 'regular';
  const journeys = useJourneyContexts(regular && !staff);
  return (
    <>
      <title>{documentTitle(FEED_TITLE)}</title>
      <FeedScreen stories={<StoriesTray />} />
      {endColumn === null || staff
        ? null
        : createPortal(
            <>
              {journeys === null ? null : <JourneyCard contexts={journeys} href={PATHS.home} onNavigate={(href) => void navigate(href)} />}
              <RecentChatsCard />
            </>,
            endColumn,
          )}
    </>
  );
}
