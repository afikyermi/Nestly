# CRITIC findings — F3.7 report (opus, round 1, 19.10.2026) — summary saved by ORCHESTRATOR
4 medium, 1 low:
1. medium — use-back-closes.ts: post "⋯" → comment "⋯" (two instances) leaves a dead overlay entry; Back closes nothing. → BUILDER (shared settling across instances).
2. medium — PostScreen delete confirm and profile remove-friend confirm don't close on Back (direction.md). → I3 polish 5c.
3. medium — post page: author sees visible edit/delete, others get "⋯" (direction.md "via ⋯"). → I3 polish 3c.
4. medium — comments and their report only on the post page (direction.md "inside the card"). → I3 polish #2 (already listed).
5. low — 23505 on reports_reporter_post_key answered 409; posts must answer 404. → BUILDER.
Routing of 2–4 per Afik 19.10 (deviation → polish list + SRS-changes row 7).

## Re-check (same CRITIC, opus): bug 1 fixed, bug 5 fixed, no new bugs.
Residual note: if polish 5d makes one click on another "⋯" open it directly, re-test the two-instance Back path (effect order).
