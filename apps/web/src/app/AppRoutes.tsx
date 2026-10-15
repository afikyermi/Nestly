import { Route, Routes } from 'react-router';
import { GuestPlaceholderPage } from '@/pages/placeholder/GuestPlaceholderPage';
import { ProtectedPlaceholderPage } from '@/pages/placeholder/ProtectedPlaceholderPage';
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
          <Route path={PATHS.login} element={<GuestPlaceholderPage title="התחברות" />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
          <Route path={PATHS.googleEntry} element={<GuestPlaceholderPage title="המשך עם Google" />} />
          <Route path={PATHS.recovery} element={<GuestPlaceholderPage title="שחזור סיסמה" />} />
          <Route path={PATHS.terms} element={<GuestPlaceholderPage title="תנאי השימוש" />} />
          <Route path={PATHS.privacy} element={<GuestPlaceholderPage title="מדיניות הפרטיות" />} />
          <Route element={<ProtectedLayout />}>
            <Route path={PATHS.home} element={<ProtectedPlaceholderPage title="בית" />} />
            <Route path={PATHS.feed} element={<ProtectedPlaceholderPage title="פיד" />} />
            <Route path={PATHS.profile} element={<ProtectedPlaceholderPage title="פרופיל" />} />
            <Route path={PATHS.settings} element={<ProtectedPlaceholderPage title="הגדרות" />} />
          </Route>
        </Routes>
      </RouteGuard>
    </>
  );
}
