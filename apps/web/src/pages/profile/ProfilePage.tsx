import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { JourneysSection } from '@/features/journeys/JourneysSection';
import { ProfileScreen } from '@/features/profile/ProfileScreen';

// The own profile screen (protected, FR-PROFILE-001, FR-PROFILE-002, PG-012; F2.1, F2.2a), the "פרופיל" tab: the profile, then
// "המסע שלי". The page only composes the features; each loads and fails on its own. Until F2.5 adds the Settings menu, the
// privacy settings are reached from here too (F2.3a, Gate 1 DR-2 A).
export function ProfilePage() {
  const toSettings = useLinkClickHandler(PATHS.settings);
  return (
    <div className="flex flex-col gap-8">
      <ProfileScreen />
      <Button variant="text" href={PATHS.settings} onClick={toSettings} className="self-start">
        הגדרות פרטיות
      </Button>
      <JourneysSection />
    </div>
  );
}
