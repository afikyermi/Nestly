# notes — F2.4c2 other-user profile, copy-my-link, relationship actions

**Approach**        `features/user-profile/` (UserProfileScreen container, UserProfileContent display, PersonLists, user-profile-texts),
                    `pages/user-profile/UserProfilePage` on route `/u/:userId`, `services/api/profile-view.ts` (GET /api/profiles/:userId),
                    `sendFriendRequest` added to `services/api/friends.ts`. Copy link: `hooks/use-copy-profile-link.ts` + adapter
                    `platform/browser-clipboard.ts`, wired in `app/App.tsx` (prop `linkCopier`, like `googleSignIn`); the button and its
                    status/link text are in FriendsContent, the flow in FriendsScreen. Shared friend texts moved to `lib/friend-texts.ts`
                    (a Feature never imports a Feature); `friends-texts.ts` re-exports them, so F2.4b imports are unchanged.
**Decisions**
 - Own user id: the web had none (`/api/me`, `/api/profile` return no id, APIs not to be changed). `lib/access-token.ts` reads the
   token's `sub` (not verified; presentation only: the link to copy, and the DR-O own-link check). Unknown id → the copy shows a
   failure alert, and a profile link opens the viewer API (the server then answers the non-Friend view).
 - c27 Guest link → Login → profile: `decideAccess` got an `options` object (`fromGuest`, `returnTo`). A Guest on `/u/<uuid>` is sent to
   `/login` with `{returnTo}` in router state (history, never storage); after sign-in the guard follows it, only if it is a profile
   path. `RouteGuard` sets `fromGuest` false once the page load has had a session, so sign-out or expiry from a profile goes where
   every protected path went (Welcome / Login with the notice), never back to that profile. This changes Q3 "the requested path is not
   kept" for profile links only. After login, a held questions / new-password screen wins (the return is dropped).
 - `/u/<non-uuid>`: the guard sends a signed-in user to the landing; `UserProfilePage` still shows "הפרופיל לא זמין" for a bad id
   that reaches it. Own link: `UserProfilePage` waits for the token read (no viewer call before the id is known), then renders ProfilePage.
 - Document title is generic ("פרופיל · Nestly"; "הפרופיל לא זמין" for 404): no name outlives the screen.
 - Send: 201 → state `sent` locally; cancel/decline → `none`; accept and remove → profile fetched again (one open, c28). 409 (`request_gone`,
   `request_exists`, `already_friends`, `incoming_pending`) and 404 on an action → fetch again + F2.4b's message (remove: the CRITIC-low
   "האדם הזה כבר לא ברשימת החברים"). A send's 429 (DR-S) → the ERR-032 message in the alert, state unchanged.
 - Section order follows c25: "החברים של <name>", then "חברים משותפים". Journey Summary is omitted when it has no item and the sentence is
   hidden (SRS: nothing in its place). Count is shown when above 0.
 - Copy (Q1/Q3, mine): `lib/friend-texts.ts` RATE_LIMITED_TEXT "נפתחו הרבה פרופילים בזמן קצר. אפשר לנסות שוב מאוחר יותר" (ERR-032, no
   number/time); `user-profile-texts.ts` empty texts "עדיין אין כאן חברים להצגה" / "אין חברים משותפים", status lines, labels
   "מספר ילדים", "גילאים", "הריון", "מין ההורה"; friends-texts: LINK_SHOWN / LINK_FAILED. Action names: label + sr-only suffix with the name.
**Deviations**      none from the criteria. c28 says "409 → F2.4b c14 message": applied to a send's 409 too, so "הבקשה כבר לא זמינה" can follow
                    an `already_friends` — spec wording kept; ORCHESTRATOR may want a distinct text.
**Deliberately not done**   no link preview/QR/share sheet; no Professional-profile link; the 429 view has no retry button (a refusal is
                    not cured by pressing again); no next-step text in empty lists.
**Uncertain**       (1) Not run in a browser: this machine has no Chrome, so Playwright (`e2e/user-profile.spec.ts`) and the Storybook a11y
                    checks were not run; verified by typecheck, lint, web unit tests and reading. (2) StrictMode in dev opens a profile twice
                    (each counts toward the limit); production does not. (3) The copy status region is `sr-only` until a result, and visible after.
                    (4) One run of the web suite had a single timeout-type failure in `google-completion.test.tsx` (step-1 group not found, under
                    36 parallel workers); it passes alone and with `tests/app`, and is unrelated to this change.
**Preview path**    Sign in → menu "חברים": the "העתקת הקישור לפרופיל שלי" button above the lists; press it: "הקישור הועתק"; paste into the
                    address bar of a signed-out window: Login, then the profile. On a profile (`/u/<id>`): the action by state, a name in a list
                    opens that person's profile. Known not to work yet: nothing creates a link to a profile except the lists and the copied
                    link (People Search is I7), so a Regular needs another account's id or a Friend/mutual entry to open one.
**Neighbouring**    none.
**Existing tests broken (not edited)**   none found: web unit suite green (one flake above). Visual baselines that will redraw: `friends`,
                    `friends-empty`, `friends-remove` (they now carry the copy button). New entries added to `e2e/visual-screens.ts`:
                    `friends-link-shown`, `user-profile`, `user-profile-restricted`, `user-profile-friend`, `user-profile-unavailable`,
                    `user-profile-rate-limited`, `user-profile-load-failed` (story ids `features-user-profile-userprofilecontent--user-profile`,
                    `…--user-profile-restricted`, `…--user-profile-friend`, `…--user-profile-unavailable`, `…--user-profile-rate-limited`,
                    `…--user-profile-load-failed`; `features-friends-friendscontent--link-shown`). No PNGs made.
**SRS trace**       FR-PRIV-001 (profile deep link), §1.4 Basic Public Profile, FR-REL-001, FR-AUTH-004 (return to the link after login),
                    ERR-032, ERR-038, NFR-SEC-005, NFR-SEC-006 (4).
