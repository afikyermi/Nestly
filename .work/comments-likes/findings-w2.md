# CRITIC findings — F3.3w2 (opus, round 1, 19.10.2026) — returned text, saved verbatim by ORCHESTRATOR

--- bug ---
severity: low
file:     C:\Users\Afik\nestly\apps\web\src\features\posts\use-feed.ts:121-128 (with :102-104)
claim:    A like that fails after the person has left the feed is never reverted in the remembered feed, so Back shows a like the server never saved.
failure:  Tap "לייק" on card 1 (the count goes up at once, and the effect at :102-104 saves the liked items to feed memory). Then tap "תגובות" or the time link before the PUT answers. The feed unmounts. The PUT then fails (500, or the network drops). `apply(before, LIKE_FAILED_TEXT)` calls setState on an unmounted component, so React drops it: the memory is never corrected and the failure status never shows. Press Back: `recallFeed` restores card 1 as pressed with count+1, but the server has no like. The person is never told (c13 requires "failure reverts with the screen.md status"; c14's "new state" is false here).
fix:      When the like fails, correct the remembered feed directly, without going through component state. For example, update the feed memory for that unit even after unmount (a feed-memory helper that applies withLike to the stored items). Or keep the restored unit's like as unconfirmed until the request settles.
--- end ---

--- bug ---
severity: low
file:     C:\Users\Afik\nestly\apps\web\src\features\posts\FeedScreen.tsx:41-42,52
claim:    The like-failure message appears only in the status line under the h1 at the top of the page, so a sighted person who is scrolled down sees the like quietly undo itself with no explanation.
failure:  Scroll to card 25 of a two-page feed and tap "לייק". The request fails. The heart and count revert, and "הלייק לא נשמר. אפשר לנסות שוב" appears in the region under "הפיד", which is off screen. Only screen-reader users get the message (it is polite). Everyone else sees an unexplained revert, which looks like a broken button. screen.md asks for a polite status and the revert, but this placement makes the visible half of the message unreachable.
fix:      Keep the single polite region. Also show the failure text where the person can see it: next to that card's action row, or as a pinned toast in the viewport.
--- end ---

--- bug ---
severity: low
file:     C:\Users\Afik\nestly\apps\web\src\features\posts\feed-state.ts:71-73 (no test in apps/web/tests)
claim:    c13 is marked [U+E], but the diff adds no unit test. Nothing tests `withLike` or the FeedCard action row in isolation (no row without onToggleLike, count clamped at 0, other units kept as the same objects, an unknown id ignored).
failure:  Suppose a later change to `withLike` breaks the clamp or the "unit not in list" guard, for example a missing id that changes every unit. The only thing that would catch it is the Playwright suite (slow, Preview/CI only). Its stubs never send a like for an unlisted unit or with likeCount 0 while liked, so those paths are never run.
fix:      TEST ENGINEER adds Vitest/RTL tests derived from c13: name "לייק" at 0 and "לייק, N" at N ≥ 1, `aria-pressed`, href `/posts/:id#comments`, no row without onToggleLike, `withLike` changes ±1 for one unit only and never goes below 0.
--- end ---

Open: none. Next owner: ORCHESTRATOR (lows fixed or debt.md; no re-check).
