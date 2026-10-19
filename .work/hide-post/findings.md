# CRITIC findings — F3.8 medical-hotlines + F3.9 hide-post (opus, round 1, 19.10.2026) — returned text, saved by ORCHESTRATOR

--- bug ---
severity: medium
file:     apps/web/src/hooks/use-back-closes.ts:30 (with apps/web/src/components/ui/more-actions-menu.tsx:136, modal={false})
claim:    When the menu closes by an outside click, the hook steps back one history entry. If that click lands on a link, the step back races with the link's push, so a chosen link can be undone or leave a dead history entry.
failure:  Menu open (overlay entry K2 over /feed K1) → tap another card's time link / bottom-nav / hamburger → pointerdown closes the non-modal menu → navigate(-1) (async) races the link's synchronous push → user lands back on /feed, or a stale overlay entry makes the next Back dead. A reload while K2 is current also leaves a dead first Back. No e2e covers it; order unconfirmed in a browser.
fix:      On close without Back, don't navigate(-1) if the location already left the overlay entry (check the current entry, or replace back to the screen's state). Add e2e: menu open → click another card's time link → /posts/:id → Back → /feed same scroll.
--- end ---

--- bug ---
severity: medium
file:     apps/web/src/features/posts/FeedContent.tsx:144 (ConfirmDialog → components/shared/confirm-dialog.tsx, Radix AlertDialog)
claim:    The in-feed delete confirmation does not close on an outside click; direction.md requires Back, Esc or outside click; no approved exception.
failure:  Own card → "⋯" → "מחיקת הפוסט" → tap the dimmed feed → nothing happens.
fix:      Decision: either record an exception for destructive alertdialogs, or outside click = cancel while not in flight. Route to a DECISION REQUEST or the I3 UX-polish list.
--- end ---

--- bug ---
severity: low
file:     apps/web/src/features/posts/FeedScreen.tsx:66-79; e2e/hide-post.spec.ts:2657
claim:    Own share's menu omits "עריכת הפוסט" against spec c8; the e2e expectation traces to BUILDER's assumption, not a criterion.
failure:  Own share → "⋯" → only "מחיקת הפוסט"; the test locks in code behaviour.
fix:      Amend spec c8/screen.md (own share: delete only; NS005) and cite it in the test.
--- end ---

--- bug ---
severity: low
file:     apps/web/src/features/posts/FeedScreen.tsx:51 (useBackCloses onBack keeps a saving confirm)
claim:    Back during an in-flight delete consumes the overlay entry but keeps the dialog; after a failure the next Back leaves the feed with the dialog open.
failure:  Confirm delete → Back while "מוחקים" → 500 → dialog shows failure → Back navigates away from /feed.
fix:      If Back pops while saving, push the overlay entry again (or on failure).
--- end ---

ORCHESTRATOR: 1 and 4 → BUILDER (same agent, fix round) → CRITIC re-check of 1. 2 → I3 UX-polish item 5 (shared dialog: outside click = cancel, never the action) and "שינויים ל-SRS" row 7, as CRITIC's fix routes it. 3 → spec c8 amended (own share: delete only, NS005); TEST ENGINEER re-cites the test.

## Re-check (opus, fresh — fix >60 lines), 19.10.2026: bug 1 fixed, bug 4 fixed. Two new lows:
- low A — FeedScreen.tsx:68-74: a held outside click is replayed as navigate(path); the bottom-nav item of the open screen pushes a duplicate /feed (dead first Back). Fix: let the link's own handler run after the overlay entry is gone / honour replace-on-same-location.
- low B — use-back-closes.ts:52-67: reopening an overlay within the 400 ms timer stacks a second overlay entry; Back then leaves the menu open. Fix: reuse the pending entry on reopen; clear byPointer when an outside press does not close.
ORCHESTRATOR: A and B → I3 UX-polish item 5b (history overlay); debt.md until then. Open: no e2e for bug 4's path (TEST ENGINEER may add under c13 in polish).
