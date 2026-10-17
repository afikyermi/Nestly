# findings — F2.4a (CRITIC, opus, 17.10.2026; saved by ORCHESTRATOR, the harness refused CRITIC's write)

--- bug ---
severity: medium
file:     apps/server/src/services/friends-service.ts:516-519 (send, `lift_cancel` branch)
claim:    when `liftCancel` changes 0 rows, `send` returns `unavailable` (404) instead of re-classifying the pair — two concurrent sends
          after a cancel answer differently for a declined request than for a pending one, so the requester can learn of a decline
          (breaks DR-3 silence) and c4's "the other call gets 409" fails.
failure:  B declines A->B; A cancels it (200, same as pending); A fires two concurrent sends. Both inserts hit the directional index, both
          reads see `lift_cancel`; tx1 lifts, tx2 waits, re-check fails, 0 rows -> 404. Result {201, 404}; for an unanswered request the
          same sequence gives {201, 409}. Repeatable without trace. The same 0-row path returns 404 when B's DR-7 reopen retires the row
          between A's read and A's lift.
fix:      on no row from `liftCancel`, re-read the pair and re-run `conflictOf`, one bounded retry; never `unavailable` while a row of the
          pair is visible to the caller. Db test: declined + cancelled, two concurrent sends -> {201, 409}.
status:   fixed 7f6b8a8, tests e3a8e53 — validated by CRITIC 17.10

--- bug ---
severity: low
file:     apps/server/src/routes/friends.ts:336-349 (actionHandler) · apps/server/src/repositories/friends-repository.ts:209-215 (removeFriendship)
claim:    the four action routes accept the caller's own id; remove then ends every Friendship of the caller, and accept/decline/cancel
          answer 403 `account_unavailable`.
fix:      400 `invalid` when target = caller, before any query (as `send`); optionally require $t to be the other party in remove's WHERE.
status:   fixed 7f6b8a8, tests e3a8e53 — validated by CRITIC 17.10

--- bug ---
severity: low
file:     supabase/migrations/20261017160000_friendships.sql (version) · .work/friends/schema.md:136, :210
claim:    F2.4c1 is planned on the same version; its down script would delete F2.4a's history row.
fix:      renumber F2.4c1.
status:   fixed in records — schema.md "Amendment — migration versions" (F2.4c1 takes 20261017170000+). Validated by CRITIC at F2.4c1's review.

Open QUESTION (60_/62_ not in review.diff): resolved — both committed on the branch after the diff was cut.
