# notes — F2.4b FriendsPage (PG-036)

**Approach**        `services/api/friends.ts` (calls, outcome union), `features/friends/` (FriendsScreen container, FriendsContent display,
                    friends-texts), `pages/friends/FriendsPage.tsx`, route `/friends` in paths.ts (PROTECTED_PATHS) and AppRoutes, menu item
                    "חברים" first in the side menu (SRS order: Friends before Settings). Reuses ConfirmDialog, InlineAlert, Avatar, Button, Skeleton.
                    Stories: FriendsContent (Lists, Empty, RemoveDialog + states), FriendsScreen (flows), ProtectedLayout FriendsNoneCurrent.
**Decisions**       Action names = visible label + sr-only "בקשת החברות של <name>" (Button has no aria-label passthrough). Accept moves the
                    entry locally (no reload). 404 `unavailable` on an action is treated like 409 `request_gone` (reload + "הבקשה כבר לא
                    זמינה"). Success status lines (sr-only, "הבקשה אושרה" etc.) and the empty/failure copy are mine (Q1, ux-copy-he).
                    After accept/decline/cancel/remove focus goes to the affected list's heading (the button is gone); cancel/Escape of the
                    dialog returns to the opener.
**Deviations**      none.
**Deliberately not done**   requestedAt is not shown. No next-step in the empty texts (no screen creates a request before F2.4c2).
**Uncertain**       the `latestTick.current = ...` ref write during render in FriendsContent (lint passes). Hebrew of the sr-only names.
**Preview path**    sign in, menu, "חברים": three lists; accept/decline/cancel; "הסרה" opens the dialog. The API needs data from F2.4a rows.
**Neighbouring**    none.
**Existing tests broken (not edited)**
 - apps/web/tests/app/access-decision.test.ts, "[F1.2 c6]...": the protected-path list now also holds '/friends'.
 - e2e/app-shell-guard-shell.spec.ts:176,194 and e2e/app-shell-guard-stories.spec.ts:77: the drawer holds five items, 'חברים' (link to /friends) first.
**SRS trace**       FR-REL-001, PG-036, FR-MENU-001 (Friends item), AC-034.
