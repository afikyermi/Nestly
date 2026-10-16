import { RecoveryForm } from '@/features/recovery/RecoveryForm';

// Password recovery (Guest). The page only composes the feature; the form owns its state.
export function RecoveryPage() {
  return <RecoveryForm />;
}
