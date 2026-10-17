// Visual regression: the screens compared against a committed baseline. An opt-in list: only a listed screen is compared,
// so CI stays green for screens with no baseline yet. A feature that touches a screen adds an entry and commits its two
// baselines (e2e/__screenshots__/<name>-phone.png, <name>-desktop.png) in the same PR; a listed screen with a missing
// baseline FAILS. Baselines come from Linux Chrome only (the `update-baselines` workflow), never from another OS.
import type { SessionState } from './app-helpers';

interface ScreenBase {
  /** Unique, [a-z0-9-]: the baseline file name. */
  name: string;
}
export interface StoryScreen extends ScreenBase {
  kind: 'story';
  id: string;
}
/** A route of the e2e build of the app, with the test session set to `state` (null = leave it loading). */
export interface AppScreen extends ScreenBase {
  kind: 'app';
  route: string;
  state: SessionState | null;
  /** Open the side menu before the screenshot (the menu is the screen). */
  openMenu?: boolean;
}
export type Screen = StoryScreen | AppScreen;

export const SCREENS: Screen[] = [
  // F1.6 c16: the recovery form for a Guest. c17/c18: the questions screen in its change mode (signed in, questions exist) and
  // in its held setup mode (signed in, questions missing).
  { kind: 'app', name: 'recovery', route: '/recovery', state: 'signed-out' },
  { kind: 'app', name: 'recovery-questions-change', route: '/recovery-questions', state: 'signed-in' },
  { kind: 'app', name: 'recovery-questions-setup', route: '/recovery-questions', state: 'signed-in-needs-recovery' },
  // F2.0 c14: the forced new-password screen (any route lands on it, so '/feed' is used); c15: the password-change screen, and the
  // side menu open with the new item. The menu is opened by the test via `menu: true` below.
  { kind: 'app', name: 'set-new-password', route: '/feed', state: 'signed-in-needs-new-password' },
  { kind: 'app', name: 'password-change', route: '/change-password', state: 'signed-in' },
  { kind: 'app', name: 'side-menu', route: '/feed', state: 'signed-in', openMenu: true },
  // F2.1 c17: the profile screen's states. Story entries: the e2e build's test session has no access token, so the app route cannot
  // load a profile; each story draws one state from props (features/profile/ProfileContent.stories.tsx).
  { kind: 'story', name: 'profile-view', id: 'features-profile-profilecontent--view' },
  { kind: 'story', name: 'profile-edit', id: 'features-profile-profilecontent--edit' },
  { kind: 'story', name: 'profile-edit-errors', id: 'features-profile-profilecontent--edit-errors' },
  { kind: 'story', name: 'profile-load-failed', id: 'features-profile-profilecontent--load-failed' },
  { kind: 'story', name: 'profile-edit-save-failed', id: 'features-profile-profilecontent--save-failed' },
  // F2.2a c1-c4, c6, c12, c13: the "המסע שלי" section's states, story entries for the same reason (features/journeys/JourneysContent.stories.tsx).
  { kind: 'story', name: 'journey-view', id: 'features-journeys-journeyscontent--journey-view' },
  { kind: 'story', name: 'journey-view-empty', id: 'features-journeys-journeyscontent--journey-view-empty' },
  { kind: 'story', name: 'journey-load-failed', id: 'features-journeys-journeyscontent--journey-load-failed' },
  { kind: 'story', name: 'child-form', id: 'features-journeys-journeyscontent--child-form' },
  { kind: 'story', name: 'child-form-errors', id: 'features-journeys-journeyscontent--child-form-errors' },
  { kind: 'story', name: 'children-limit', id: 'features-journeys-journeyscontent--children-limit' },
  { kind: 'story', name: 'journey-save-failed', id: 'features-journeys-journeyscontent--journey-save-failed' },
  // F2.2b1 c14, c15: the pregnancy's due-date form, its error, and the add action with has_child only.
  { kind: 'story', name: 'pregnancy-form', id: 'features-journeys-journeyscontent--pregnancy-form' },
  { kind: 'story', name: 'pregnancy-form-errors', id: 'features-journeys-journeyscontent--pregnancy-form-errors' },
  { kind: 'story', name: 'journey-view-add-pregnancy', id: 'features-journeys-journeyscontent--journey-view-add-pregnancy' },
  // F2.2b2 c16, c21, c22, c25: the confirmation dialogs, its failure, no journey left, and the birth form.
  { kind: 'story', name: 'journey-confirm', id: 'features-journeys-journeyscontent--journey-confirm' },
  { kind: 'story', name: 'journey-confirm-planning', id: 'features-journeys-journeyscontent--journey-confirm-planning' },
  { kind: 'story', name: 'journey-confirm-failed', id: 'features-journeys-journeyscontent--journey-confirm-failed' },
  { kind: 'story', name: 'journey-view-none', id: 'features-journeys-journeyscontent--journey-view-none' },
  { kind: 'story', name: 'birth-form', id: 'features-journeys-journeyscontent--birth-form' },
  // F2.3a c1, c4, c16: the privacy settings section of Settings, story entries for the same reason
  // (features/privacy/PrivacyContent.stories.tsx).
  { kind: 'story', name: 'privacy-settings', id: 'features-privacy-privacycontent--defaults' },
  { kind: 'story', name: 'privacy-settings-load-failed', id: 'features-privacy-privacycontent--load-failed' },
  { kind: 'story', name: 'privacy-settings-save-failed', id: 'features-privacy-privacycontent--save-failed' },
];
