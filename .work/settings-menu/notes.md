# notes — F2.5 settings and side-menu destinations

**Approach**        Web only, nothing committed. A section's address is the hash of the Settings path (`/settings#account|privacy|terms`, Q2 default), so `PROTECTED_PATHS` is unchanged.
`lib/settings-sections.ts` holds the section ids, labels and hash parsing. `ProtectedLayout` renders "חברים", one item per section, the two security items and Logout; the section open now gets `aria-current="page"` (new `current` prop on MenuItem). `SettingsPage` has h1, then Account (link "עריכת פרופיל"), Privacy & Security (F2.3 form plus the two security links), Terms & Privacy (two links, same tab). An effect on `[section, location.key]` scrolls the named section into view and focuses its h2. `decideAccess` lets an active signed-in user open `/terms` and `/privacy` (after the held checks, so the held behaviour is as before). The F2.3 temporary link on the profile page is removed. `GuestPlaceholderPage`: a signed-in user's back control (label "חזרה להגדרות") goes to `/settings#terms`; a Guest's still goes to Welcome.

**Decisions**
- Menu focus: the drawer's `finalFocus` used to send focus to `main`, which ran after Settings' own focus effect and would have stolen it. `AppShell` now prefers `main [data-initial-focus]` and falls back to `main`; SettingsPage sets that attribute on the focused h2 and removes it on cleanup. Other screens are unaffected.
- The h2 of F2.3's section was "פרטיות", the menu item and c2 say "פרטיות ואבטחה". I changed the `TITLE` constant in `features/privacy/privacy-texts.ts` to "פרטיות ואבטחה" (text only; markup and behaviour of the form untouched). That redraws the three `privacy-settings*` story baselines.
- "Replace the history entry on the open screen" compares against path+known hash, so `/settings#account` clicked twice replaces; an unknown hash pushes.
- Reload of `/settings#x` focuses the section h2 too (the effect runs on mount); harmless.
- Section wrappers carry `scroll-mt-20` so the sticky top bar does not cover the heading; `scrollIntoView()` on the wrapper, `focus({preventScroll:true})` on the h2. The lint rule bans `[&_h2]:` variants outside `components/ui`, hence the wrapper.
- No `as`, no new dependency, no request added; Settings makes no call except F2.3's `GET /api/privacy`.

**Deviations**      The `TITLE` text change above (F2.3 asked "unchanged"). The visual entry `side-menu` was renamed `side-menu-open` per the spec's screen name.

**Deliberately not done**   No account deletion, notification settings, email display, groups/help/rules items. No PNGs. No SRS edits. Not committed.

**Uncertain**
- Visual baselines: `settings` is new (the e2e test session has no token, so Privacy shows its load failure in the baseline); `side-menu-open` replaces `side-menu`.
- Axe at 360/1280 and the focus order in a real browser were not run here (no Playwright run on this machine); Chrome/Edge e2e is for CI/E.
- When held (needs questions or must set password), the back control on `/terms` leads to Settings, which then bounces to the held screen. Same end state as before.
- `vitest` full run: one google-completion test failed once under load and passed alone and in the re-run of its folder (not touched by this change).

**Preview path**   Sign in (the account must have recovery questions) -> Hamburger -> the menu shows חברים, חשבון, פרטיות ואבטחה, תנאים ופרטיות, שאלות לשחזור סיסמה, החלפת סיסמה, התנתקות. Click each section: the drawer closes, Settings shows with that h2 focused, the address ends `#account|#privacy|#terms`; reload keeps it; Back returns. "עריכת פרופיל" -> /profile. In Terms & Privacy open "תנאי השימוש" -> the placeholder with a "חזרה להגדרות" control back to the section. Profile page no longer shows "הגדרות פרטיות". Known not to work: nothing known; the Privacy section needs the API (shows its load failure otherwise).

**Existing tests this change breaks (TEST ENGINEER's; most already updated in the working tree)**
- `apps/web/tests/app/access-decision.test.ts`: the "signed-in at a Guest route redirects" loop must exclude `/terms` and `/privacy`, and add the render cases (already done in the tree). Line ~143 filter likewise (done).
- `e2e/app-shell-guard-shell.spec.ts` c19/c20 (drawer order, "הגדרות" item gone), `e2e/app-shell-guard-a11y.spec.ts` c24 (Enter on "חשבון", h2 focused), `e2e/app-shell-guard-stories.spec.ts` c27 (drawer items) — updated in the tree and consistent with this build.
- `e2e/privacy.spec.ts` ~line 200: the profile-page link test "הגדרות פרטיות" is obsolete (link removed); must be deleted or replaced by the absence assertion (the tree shows it modified; confirm).
- Anything that looked for the F2.3 section h2 "פרטיות" (none found by grep).
- Visual baselines: `e2e/__screenshots__/side-menu-{phone,desktop}.png` are orphaned and must be deleted; new `side-menu-open-*` and `settings-*` need generating; `privacy-settings*` (3 stories x 2) redraw with the new h2 text.
- `e2e/app-shell-guard-shell.spec.ts` c17 (no nav link current on /settings) still holds.

**Neighbouring**
- `/home/user/Nestly/pw.scratch.config.ts` (untracked, not mine, from the parallel TEST ENGINEER run) makes `npm run lint` fail with a parserOptions.project error; delete it or exclude it before commit. Lint is otherwise clean.
- `FocusOnNavigation` focuses `main` on a hash-only change, so the Settings effect has to win by running after it; this relies on effect order (FocusOnNavigation is the earlier sibling). Worth a test if the route tree changes.

**CRITIC round 1 fixes (cf6ec44 follow-up)**
- Scroll reset: AppShell takes `scrollResetKey` (ProtectedLayout passes the normalized path, so hash-only changes do not reset) and sets `main.scrollTop = 0` in an effect.
- Keyboard scrolling on a direct load: focusing `main` on load would make the skip link no longer the first Tab stop (e2e part-f [41][17] presses Tab first and expects the A). Chosen instead: a document keydown listener moves focus to `main` (preventScroll) only for the first scroll key (Space, PageUp/Down, Home, End, arrows, no modifiers) while focus is still on `body`; the key then scrolls `main`. Tab order on load is untouched. Not verified in a real browser (default action after focus change in keydown); needs a manual check in Chrome/Firefox/Safari.
- iOS keyboard: viewport `interactive-widget=resizes-content`; the `html` bottom scroll-padding (and its lg override) is removed, `main` has `scroll-py-4` instead (bars are outside it).
- Print: `print:h-auto` on the frame, `print:overflow-visible` on `main`.
- ORCHESTRATOR, 17.10: keydown fix verified in Chromium (AppShell story, 375×500): focus on `body`, first PageDown → focus `main`, `main.scrollTop` 0→97 (its max) on the same press; first Tab on load still lands on the skip link. Local e2e subset (shell, keyboard, part-f, settings-menu, a11y, journeys): 767 passed.
