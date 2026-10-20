import { useParams } from 'react-router';
import { checkUserId } from '@nestly/shared';
import { WriteMessageButton } from '@/features/chat/WriteMessageButton';
import { UserProfileContent } from '@/features/user-profile/UserProfileContent';
import { UserProfileScreen } from '@/features/user-profile/UserProfileScreen';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { ProfilePage } from '@/pages/profile/ProfilePage';

// Another person's profile (protected, FR-PRIV-001, FR-REL-001; F2.4c2), reached by `/u/<user id>`: from a list, or from a shared link.
// The caller's own link opens the own profile page (F2.1) and asks the viewer API nothing (c27, DR-O); the id of the caller is read
// from the token only to tell the two apart. The screen is keyed by the person, so opening another profile starts from nothing.
export function UserProfilePage() {
  const { userId = '' } = useParams();
  const own = useOwnUserId();
  const target = checkUserId(userId);
  if (!target.ok) return <UserProfileContent view={{ kind: 'unavailable' }} />;
  if (own.kind === 'loading') return <UserProfileContent view={{ kind: 'loading' }} />;
  if (own.userId === target.userId) return <ProfilePage />;
  return <UserProfileScreen key={target.userId} userId={target.userId} chatAction={(name) => <WriteMessageButton userId={target.userId} name={name} />} />;
}
