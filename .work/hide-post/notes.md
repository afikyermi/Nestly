# notes — hide-post (F3.9)

**Approach**  Server: `PUT|DELETE /api/posts/:id/hide` (routes/post-hides.ts → services/post-hides-service.ts →
repositories/post-hides-repository.ts, the only file naming post_hides). `hideFaultReply` maps NS004→404, NS003→409, 42501→403;
NS003/NS004 join the deterministic set. Web: one "⋯" menu per card (components/ui/more-actions-menu.tsx, Radix DropdownMenu),
items decided per card in FeedScreen; placeholder + undo (HiddenPostCard); own-card edit/delete (amended c8, c13).
**Decisions**  Service checks "active Regular" first (readOwnAccounts, as likes) so a suspended DELETE is 403, not a silent 204.
Hidden ids live in feed state; Back's memory stores items minus hidden; a new snapshot drops placeholders. Back-closes-overlay:
hooks/use-back-closes.ts pushes one same-address entry (state mark, lib/history-overlay.ts) while a menu or confirm is open; Back
pops it and closes; other closes pop it; "עריכת הפוסט" replaces it with /posts/:id. useFeed reads the navigation type once at mount,
so the overlay entry never refetches. Edit opens via an in-memory one-shot (flash-status `handOverEdit`/`takeEdit`) → PostScreen
starts its existing edit form. Delete reuses F3.1's dialog texts and DELETE /posts/:id; 204 or 404 removes the card.
**Deviations**  Menu in components/ui (lint: Radix only in ui). check-stories gains `ui/more-actions-menu: 4`.
**Deliberately not done**  hide on post page; "דיווח" (F3.7); instant removal of loaded shares of X (c12).
**Uncertain**  A hide whose 204 lands after the user left the feed: Back memory may still hold that card until reload. Back while
a delete is in flight keeps the dialog (no history entry left; it closes normally after). Radix focus-return timing vs our focus
effect after hide/undo is untested in a browser.
**Evidence**  typecheck, lint, budgets, stories, unit (server/shared all green; web 1 known failure, see F3.8 notes). db-local test: 757 passed, 5 skipped (19.10).
**Neighbouring**  PostScreen's `arrival` uses `useRef(takeStatus(...))`, which re-runs takeStatus on every render (harmless today).
