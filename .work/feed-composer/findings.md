# CRITIC findings — feed-composer (sonnet, round 1, 19.10.2026) — returned text, saved by ORCHESTRATOR
0 critical, 0 high, 0 medium, 2 low. Nothing blocks the merge.

--- bug ---
severity: low
file:     apps/web/src/features/posts/FeedScreen.tsx (write rendered when !empty incl. phases initial/first-error); feed-state.ts withPublished
claim:    A post published while the feed has not displayed a list loses its card and its focus.
failure:  /posts/new opens the composer; publish before the first page (or during first-error) → addPublished adds the unit but the list isn't rendered → setCardFocus finds no article → focus on body; status "הפוסט פורסם" with no card; in initial, withPage(firstPage) replaces the list.
fix:      ensure the focus target exists after publish, or fall back to the heading.
--- end ---

--- bug ---
severity: low
file:     apps/web/src/features/posts/FeedScreen.tsx ({empty ? null : write} and emptyAction inside FeedContent)
claim:    The composer sits in two tree positions, so it remounts when the feed flips loading → empty while in use.
failure:  composer open and sending → feed answers empty → remount loses sending/saving → a second "פרסום" sends a duplicate; the dead instance still calls onPublished. Breaks F3.1 c16 one-request guarantee (carried by c3).
fix:      render the composer in one stable position.
--- end ---

ORCHESTRATOR: both → BUILDER now (small); no re-check (lows).
