import { JourneysSection } from '@/features/journeys/JourneysSection';
import { ProfileScreen } from '@/features/profile/ProfileScreen';

// The own profile screen (protected, FR-PROFILE-001, FR-PROFILE-002, PG-012; F2.1, F2.2a), the "פרופיל" tab: the profile, then
// "המסע שלי". The page only composes the features; each loads and fails on its own.
export function ProfilePage() {
  return (
    <div className="flex flex-col gap-8">
      <ProfileScreen />
      <JourneysSection />
    </div>
  );
}
