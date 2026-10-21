import { Route, Routes } from 'react-router';
import { AdminAnalyticsPage, AdminAnnouncementsPage, AdminChildDataPage, AdminMarketplacePage, AdminPromotionsPage, AdminSponsoredPage, AdminAuditPage, AdminCommunityPage, AdminMediaPage, AdminReportsPage, AdminSupportPage, AdminTeamPage, AdminUsersPage } from '@/pages/admin/AdminPages';
import { JoinTeamPage } from '@/pages/join-team/JoinTeamPage';
import { AdminIndex, AdminLayout } from '@/pages/admin/AdminLayout';
import { ChangePasswordPage } from '@/pages/change-password/ChangePasswordPage';
import { ChatPage } from '@/pages/chat/ChatPage';
import { ConversationPage } from '@/pages/chat/ConversationPage';
import { AdminGuidesPage } from '@/pages/admin-guides/AdminGuidesPage';
import { CommunityRulesPage } from '@/pages/community-rules/CommunityRulesPage';
import { NewPostRedirect } from '@/pages/compose-post/NewPostRedirect';
import { FeedPage } from '@/pages/feed/FeedPage';
import { FriendsPage } from '@/pages/friends/FriendsPage';
import { GroupPage } from '@/pages/groups/GroupPage';
import { GroupsPage } from '@/pages/groups/GroupsPage';
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
import { SupportPage } from '@/pages/support/SupportPage';
import { SupportThreadPage } from '@/pages/support/SupportThreadPage';
import { TrackerPage } from '@/pages/tracker/TrackerPage';
import { UserProfilePage } from '@/pages/user-profile/UserProfilePage';
import { WelcomePage } from '@/pages/welcome/WelcomePage';
import { OffersPage } from '@/pages/professionals/OffersPage';
import { BillingPage, FollowingPage, HelpRequestsPage, PromotionPage } from '@/pages/professionals/ProfessionalExtraPages';
import { ProArticlesPage } from '@/pages/professionals/ProArticlesPage';
import { ProfessionalPage } from '@/pages/professionals/ProfessionalPage';
import { ProProfilePage } from '@/pages/professionals/ProProfilePage';
import { ServicesPage } from '@/pages/professionals/ServicesPage';
import { EditListingPage, ListingPage, MarketplacePage, MyListingsPage, NewListingPage } from '@/pages/marketplace/MarketplacePages';
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
          <Route path={PATHS.joinTeam} element={<JoinTeamPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path={PATHS.home} element={<HomePage />} />
            <Route path={PATHS.tracker} element={<TrackerPage />} />
            <Route path={PATHS.feed} element={<FeedPage />} />
            <Route path={PATHS.newPost} element={<NewPostRedirect />} />
            <Route path={PATHS.post} element={<PostPage />} />
            <Route path={PATHS.profile} element={<ProfilePage />} />
            <Route path={PATHS.settings} element={<SettingsPage />} />
            <Route path={PATHS.friends} element={<FriendsPage />} />
            <Route path={PATHS.groups} element={<GroupsPage />} />
            <Route path={PATHS.group} element={<GroupPage />} />
            <Route path={PATHS.notifications} element={<NotificationsPage />} />
            <Route path={PATHS.search} element={<SearchPage />} />
            <Route path={PATHS.userProfile} element={<UserProfilePage />} />
            <Route path={PATHS.recoveryQuestions} element={<RecoveryQuestionsPage />} />
            <Route path={PATHS.changePassword} element={<ChangePasswordPage />} />
            <Route path={PATHS.medicalHotlines} element={<MedicalHotlinesPage />} />
            <Route path={PATHS.communityRules} element={<CommunityRulesPage />} />
            <Route path={PATHS.setNewPassword} element={<SetNewPasswordPage />} />
            <Route path={PATHS.chat} element={<ChatPage />} />
            <Route path={PATHS.conversation} element={<ConversationPage />} />
            <Route path={PATHS.support} element={<SupportPage />} />
            <Route path={PATHS.supportThread} element={<SupportThreadPage />} />
            <Route path={PATHS.services} element={<ServicesPage />} />
            <Route path={PATHS.professional} element={<ProfessionalPage />} />
            <Route path={PATHS.proProfile} element={<ProProfilePage />} />
            <Route path={PATHS.proArticles} element={<ProArticlesPage />} />
            <Route path={PATHS.offers} element={<OffersPage />} />
            <Route path={PATHS.marketplace} element={<MarketplacePage />} />
            <Route path={PATHS.myListings} element={<MyListingsPage />} />
            <Route path={PATHS.newListing} element={<NewListingPage />} />
            <Route path={PATHS.listing} element={<ListingPage />} />
            <Route path={PATHS.editListing} element={<EditListingPage />} />
            <Route path={PATHS.following} element={<FollowingPage />} />
            <Route path={PATHS.helpRequests} element={<HelpRequestsPage />} />
            <Route path={PATHS.proPromotion} element={<PromotionPage />} />
            <Route path={PATHS.proBilling} element={<BillingPage />} />
            <Route path={PATHS.admin} element={<AdminLayout />}>
              <Route index element={<AdminIndex />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
              <Route path="support" element={<AdminSupportPage />} />
              <Route path="guides" element={<AdminGuidesPage />} />
              <Route path="media" element={<AdminMediaPage />} />
              <Route path="team" element={<AdminTeamPage />} />
              <Route path="community" element={<AdminCommunityPage />} />
              <Route path="announcements" element={<AdminAnnouncementsPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="child-data" element={<AdminChildDataPage />} />
              <Route path="marketplace" element={<AdminMarketplacePage />} />
              <Route path="sponsored" element={<AdminSponsoredPage />} />
              <Route path="promotions" element={<AdminPromotionsPage />} />
            </Route>
          </Route>
        </Routes>
      </RouteGuard>
    </>
  );
}
