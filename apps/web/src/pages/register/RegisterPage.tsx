import { RegistrationFlow } from '@/features/registration/RegistrationFlow';

// PG-004 Registration. The page only composes the flow; the flow owns the steps and their state.
export function RegisterPage() {
  return <RegistrationFlow />;
}
