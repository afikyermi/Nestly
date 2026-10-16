# Result — F1.6 password-recovery

**State:** ready to merge (PR 31), waiting for Afik's morning approval; not merged. CI green. Migration `20261015200000` is on nestly-preview (run 38802031784); production waits for `db-production`.
| | Planned | Actual |
|---|---|---|
| Parts | a (schema/RLS) · b (server) · c (screens) | as planned; product ≈ 2,900 lines, tests ≈ 5,070 (1.75×, within the hard 2×) |
| Reviews | CRITIC opus a+b, sonnet c | a+b: with Concern (N1 → debt) · c: with Concern → re-check, lows → debt |
| Preview (Gate 3) | Afik by hand | replaced by E (Afik, 16.10): `preview-e2e` runs 38816319396 and 38817721595, 14/14 each, F1.6 c9, c16–c18 at 375 and 1280 |
**SRS:** implements FR-AUTH-003, AC-092, OP-029 (questions instead of email); the as-built ERR rows for DR3 go to the per-Initiative SRS update (debt 4a). The SRS 2.18 batch (Afik's I3–I5 decisions) rides in this PR.
