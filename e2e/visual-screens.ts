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
}
export type Screen = StoryScreen | AppScreen;

export const SCREENS: Screen[] = [];
