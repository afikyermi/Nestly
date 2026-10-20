import { Route, Routes } from 'react-router';
import { AdminAuditPage, AdminReportsPage, AdminUsersPage } from '@/pages/admin/AdminPages';
import { AdminIndex, AdminLayout } from '@/pages/admin/AdminLayout';
import { ChangePasswordPage } from '@/pages/change-password/ChangePasswordPage';
import { CommunityRulesPage } from '@/pages/community-rules/CommunityRulesPage';
import { NewPostRedirect } from '@/pages/compose-post/NewPostRedirect';
import { FeedPage } from '@/pages/feed/FeedPage';
import { FriendsPage } from '@/pages/friends/FriendsPage';
import { HomePage } from '@/pages/home/HomePage';
import { GoogleReturnPage } from '@/pages/google-return/GoogleReturnPage';
import { GuestPlaceholderPage } from '@/pages/placeholder/GuestPlaceholderPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { MedicalHotlinesPage } from '@/pages/medical-hotlines/MedicalHotlinesPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { PostPage } from '@/pages/post/PostPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { RecoveryPage } from '@/pages/recovery/RecoveryPage';
import { RecoveryQuestionsPage } from '@/pages/recovery-questions/RecoveryQuestionsPage';
import { RegisterPage } from '@/pages/register/RegisterPage';
import { SearchPage } from '@/pages/search/SearchPage';
import { SetNewPasswordPage } from '@/pages/set-new-password/SetNewPasswordPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { TrackerPage } from '@/pages/tracker/TrackerPage';
import { UserProfilePage } from '@/pages/user-profile/UserProfilePage';
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
            <Route path={PATHS.home} element={<HomePage />} />
            <Route path={PATHS.tracker} element={<TrackerPage />} />
            <Route path={PATHS.feed} element={<FeedPage />} />
            <Route path={PATHS.newPost} element={<NewPostRedirect />} />
            <Route path={PATHS.post} element={<PostPage />} />
            <Route path={PATHS.profile} element={<ProfilePage />} />
            <Route path={PATHS.settings} element={<SettingsPage />} />
            <Route path={PATHS.friends} element={<FriendsPage />} />
            <Route path={PATHS.notifications} element={<NotificationsPage />} />
            <Route path={PATHS.search} element={<SearchPage />} />
            <Route path={PATHS.userProfile} element={<UserProfilePage />} />
            <Route path={PATHS.recoveryQuestions} element={<RecoveryQuestionsPage />} />
            <Route path={PATHS.changePassword} element={<ChangePasswordPage />} />
            <Route path={PATHS.medicalHotlines} element={<MedicalHotlinesPage />} />
            <Route path={PATHS.communityRules} element={<CommunityRulesPage />} />
            <Route path={PATHS.setNewPassword} element={<SetNewPasswordPage />} />
            <Route path={PATHS.admin} element={<AdminLayout />}>
              <Route index element={<AdminIndex />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>
          </Route>
        </Routes>
      </RouteGuard>
    </>
  );
}
