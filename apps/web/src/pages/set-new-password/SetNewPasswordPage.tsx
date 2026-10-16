import { ForcedPasswordForm } from '@/features/forced-password/ForcedPasswordForm';

// The forced new-password screen (protected, F2.0 c14): open only while the session is held there. The page only composes the feature.
export function SetNewPasswordPage() {
  return <ForcedPasswordForm />;
}
