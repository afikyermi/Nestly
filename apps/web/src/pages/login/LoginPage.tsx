import { LoginForm } from '@/features/login/LoginForm';

// PG-002 Login. The page only composes the feature; the form owns its state.
export function LoginPage() {
  return <LoginForm />;
}
