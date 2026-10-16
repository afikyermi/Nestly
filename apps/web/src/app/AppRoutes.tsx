import { Route, Routes } from 'react-router';
import { GoogleReturnPage } from '@/pages/google-return/GoogleReturnPage';
import { GuestPlaceholderPage } from '@/pages/placeholder/GuestPlaceholderPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { ProtectedPlaceholderPage } from '@/pages/placeholder/ProtectedPlaceholderPage';
import { RecoveryPage } from '@/pages/recovery/RecoveryPage';
import { RecoveryQuestionsPage } from '@/pages/recovery-questions/RecoveryQuestionsPage';
import { RegisterPage } from '@/pages/register/RegisterPage';
import { WelcomePage } from '@/pages/welcome/WelcomePage';
import { FocusOnNavigation } from './FocusOnNavigation';
import { PATHS } from './paths';
import { ProtectedLayout } from './ProtectedLayout';
import { RouteGuard } from './RouteGuard';

// Every route sits behind the RouteGuard, which decides from the route table in paths.ts (deny by default).
// Router-agnostic: App puts it in the browser router, tests and stories in a memory router.
export function AppRoutes() {
  return (
    <>
      <FocusOnNavigation />
      <RouteGuard>
        <Routes>
          <Route path={PATHS.welcome} element={<WelcomePage />} />
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
          <Route path={PATHS.googleEntry} element={<GoogleReturnPage />} />
          <Route path={PATHS.recovery} element={<RecoveryPage />} />
          <Route path={PATHS.terms} element={<GuestPlaceholderPage title="תנאי השימוש" />} />
          <Route path={PATHS.privacy} element={<GuestPlaceholderPage title="מדיניות הפרטיות" />} />
          <Route element={<ProtectedLayout />}>
            <Route path={PATHS.home} element={<ProtectedPlaceholderPage title="בית" />} />
            <Route path={PATHS.feed} element={<ProtectedPlaceholderPage title="פיד" />} />
            <Route path={PATHS.profile} element={<ProtectedPlaceholderPage title="פרופיל" />} />
            <Route path={PATHS.settings} element={<ProtectedPlaceholderPage title="הגדרות" />} />
            <Route path={PATHS.recoveryQuestions} element={<RecoveryQuestionsPage />} />
          </Route>
        </Routes>
      </RouteGuard>
    </>
  );
}
