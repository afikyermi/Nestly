import { ScheduledDeletionScreen } from '@/features/account-deletion/ScheduledDeletionScreen';

// PG-050 (FR-SET-002): open only while the session is held there. The page only composes the feature.
export function ScheduledDeletionPage() {
  return <ScheduledDeletionScreen />;
}
