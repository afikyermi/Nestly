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
];
