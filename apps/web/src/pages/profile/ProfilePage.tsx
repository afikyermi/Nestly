import { Navigate } from 'react-router';
import { JourneysSection } from '@/features/journeys/JourneysSection';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { PATHS } from '@/app/paths';
import { useStaffAccess } from '@/hooks/use-staff-access';

// The own profile screen (protected, FR-PROFILE-001, FR-PROFILE-002, PG-012; F2.1, F2.2a), the "פרופיל" tab: the profile, then
// "המסע שלי". The page only composes the features; each loads and fails on its own. A staff account has no personal profile (a work-only
// account, I14 completion): it goes to its home in the admin area.
export function ProfilePage() {
  const staff = useStaffAccess();
  if (staff.kind === 'staff') return <Navigate to={PATHS.admin} replace />;
  return (
    <div className="flex flex-col gap-8">
      <ProfileScreen />
      <JourneysSection />
    </div>
  );
}
