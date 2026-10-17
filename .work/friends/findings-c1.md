# findings — F2.4c1 (CRITIC, opus, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: medium
file:     apps/server/src/services/friends-service.ts:93 (with :103, :115-122)
claim:    a Friend Request send to an unavailable target is not counted as an open — the count rolls back with the transaction (c24 with
          c20 / DR-W A "opens of unavailable targets count").
failure:  below the limit, a send to an unknown / Professional / suspended / banned id: countOpen appends now(), insertRequest raises
          23503, the transaction aborts, 404 — count rolled back. POST /api/friend-requests becomes an unlimited "is this id an active
          Regular?" oracle. The 42501 path loses its count the same way. Untested.
fix:      when countOpen returns 0 rows, return { kind: 'unavailable' } normally (commit with the count) before reopenDeclined /
          insertRequest. Db test: N=3 — open, open, send to a random uuid (404), next open 429.
status:   fixed eee0d30, test 8d6fc95 — validated by CRITIC 17.10 (residual race on a target state change between countOpen and insert: accepted by CRITIC, at most one count, not attacker-triggerable)
