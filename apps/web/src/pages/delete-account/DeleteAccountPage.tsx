import { AccountDeletionForm } from '@/features/account-deletion/AccountDeletionForm';

// The account deletion screen (protected, PG-060, FR-SET-002), from Settings → Account. The page only composes the feature.
export function DeleteAccountPage() {
  return <AccountDeletionForm />;
}
