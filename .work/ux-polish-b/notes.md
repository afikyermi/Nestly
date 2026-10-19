# notes — ux-polish-b (I3 UX polish B)

**Approach**        Back/outside for confirmations: `AlertPanel` backdrop click = `onOpenChange(false)` (callers already ignore it while pending); each
screen adds the confirmation to its one `useBackCloses` (PostScreen, UserProfileScreen; new in FriendsScreen, JourneysSection). Side menu: AppShell
takes optional `menuOpen`/`onMenuOpenChange`; ProtectedLayout owns it with the share-site sheet in one hook. In-place card edit: `use-card-edit.ts`
(PATCH as built via `editPost`) + `withEdited`/`withMoreFocus` in feed-state; FeedCard swaps body+actions for `PostForm`. Post page author "⋯" =
`moreActions` (edit, delete; share: delete). `OriginalQuote.tsx` shared; share-link options are `MenuItem` (+`target`/`rel`). `ToTopButton.tsx`.

**Decisions**       Same-screen nav (c7): `followAfterClose(path)` drops the overlay entry and adds none when `path` is the current address.
One-press switch (c8): (1) `MoreActionsMenu` skips its close-refocus when the press landed on another "⋯" (that refocus likely dismissed the new menu);
(2) `useBackCloses` instances share the current overlay entry via `holders` (open with another holder = take over, close with another holder = no pop).
`Tooltip` got `disabled`; the to-top tooltip shows only while the text span is `display:none` (ResizeObserver). Side-menu navigating item uses
`leaveTo` (replaces the overlay entry); the current screen's item only closes the menu. "שיתוף Nestly" keeps the entry through `openingSite`.

**Deviations**      None from spec/screen. The edit API is PATCH (as built), spec says PUT. Removed `takeEdit/handOverEdit` (F3.9 c13 handoff) and `EDIT_LABEL`,
`DELETE_LABEL`. In edit the card also hides its time link and "⋯" (header + form only).

**Deliberately not done**   No Esc rule in the card form (Q2). No discard prompt. Comments in cards (ux-polish-a).

**Uncertain**       c8 root cause unverified in a browser (reasoned from Radix focus/dismiss order); two-instance (post "⋯" to comment "⋯") Back path
reasoned, needs the e2e. Logout item: closing the menu pops its overlay entry while sign-out navigates (lands on login via the guard, return target may
differ). Stale `byPointer` flag after a same-instance card-to-card switch only delays a later pop by 400 ms.

**Evidence**        typecheck, eslint, check:budgets, check:stories green; vitest 1274/1276 (2 login-screen failures are load flakes, pass alone);
`tests/app/ux-polish-b-static.test.ts` (TE, untracked) passes. No e2e run here.

**Stale tests for TEST ENGINEER**   e2e using the removed post-page "עריכה"/"מחיקה" buttons: posts, anonymous-post (+visual), hide-post (c13 opens
/posts/:id), feed-owner, comments, report-post-comments, share-in-feed, profile. Stories added: PostContent Own*, FeedCard OwnEditing/OwnEditFailed;
FriendsScreen/JourneysSection stories now in a MemoryRouter (they use `useBackCloses`).
**Neighbouring**    `@nestly/shared` resolved to the main checkout stale copy: junction `node_modules/@nestly/shared` made here (git-ignored).
