# P3 — measurements (same 2,312 Chrome tests, 3 shards; `--list` compared with line numbers removed: identical)

Source: GitHub job logs (Playwright list reporter), parsed per shard. "step" = the `playwright test` step; "job" = the
whole shard job; "run" = workflow created → updated. Retries: 1 on CI in every run (unchanged).

| Run | Config | Shard steps 1 / 2 / 3 (s) | Slowest shard job | Run total | Failures · flaky |
|---|---|---|---|---|---|
| main 39069774455 (3aab0c7) | base, 2 workers | 600 / 457 / 416 | 10:56 (shard 1: a11y alone 582 test-s in one worker) | 11:10 | 0 · 0 |
| main 39059353456 (e8cab8d) | base, 2 workers | 391 / 453 / 413 | 8:24 (shard 2) | n/a (db re-run inflated it) | 0 · 0 |
| PR 59 39076207411 (f988a8e) | a11y parallel, 2 workers | 392 / 484 / 391 | 9:03 (shard 2) | 9:17 | 0 · 1 (user-profile-actions.spec.ts:386, shard 3, not touched by P3) |
| PR 59 39077059502 (9d85130) | + 3 workers | 390 / 444 / 373 | 8:18 (shard 2) | 8:35 | 0 · 0 |
| PR 59 39078026241 (8c32ccc) | final: a11y parallel, 2 workers, sorted ids | 584 / 382 / 398 | 10:41 (shard 1: a11y 616 test-s + story builds 192 s on a slow runner) | 11:09 | 0 · 0 |

Reading (honest: run-to-run variance, 380–600 s per shard, is larger than the effect):
- a11y parallel removes the tail case: shard 1 was bounded by a11y in one worker (381–582 test-s). With it parallel,
  shard 1 sits at ~390 s whatever a11y's speed; the slowest shard becomes shard 2 (motion.spec.ts, ~220–300 test-s in one
  worker, plus part-f/journeys). Typical runs gain little; the worst observed (11:10 → ~9) gains ~2 minutes.
- 3 workers: each test ~35–40 % slower (CPU contention on 4 vCPUs), slowest shard −40 s in one sample — within noise,
  more timing pressure on focus/motion tests. **Not kept**; Playwright's default (2) stays.
- **No proven CI-time saving.** Slowest shard step: base 457–600 s, head 444–584 s; run totals base 11:10, head 9:17 / 8:35 / 11:09.
  What P3 does prove: the same 2,312 tests, 0 failures, the c5 flake gone, shard assignment stable, timeouts bounded.
  Shard 1 is heavy by test-seconds, not by count: the two story-build tests of app-shell-guard-stories (130–210 s) count
  as 2 tests in Playwright's count-based split. Real duration balancing needs either an undocumented Playwright input
  (PWTEST_SHARD_WEIGHTS, rejected: internal) or moving those builds — a shared build is out of scope by Afik's rule.
- Not 50 %. The next lever is shard 2's long file (e2e/motion.spec.ts) — parallel mode only after the same shared-state
  check as a11y; not done here (Afik: focused on a11y).
- recovery-store.db.test.ts c5: green in both PR runs (`db`), now independent of the clock.
- globalTimeout (CRITIC P3 finding 2): kept at 12 min knowingly — the slowest P3-head step was 484 s (49 % headroom); the 600 s sample was the a11y-in-one-worker tail that P3 removes.
