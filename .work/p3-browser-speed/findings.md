# P3 findings (CRITIC, round 1)

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write. Verdict: no critical/high. 1 medium, 3 low.

## Bug list

1. **MEDIUM — e2e/helpers.ts:15 (used by e2e/a11y.spec.ts:29)** — With a11y now sharded per test, which shard runs a given story test depends on `Object.keys(entries)` order of three independently built Storybook indexes. Scenario: before P3 a11y was one file in one shard, so id order was irrelevant. Now each of the ~550 tests is its own group, and Playwright assigns groups to shards by position. Each shard job runs its own `build-storybook`; if index order differs between builds (file-glob order, story-sort ties), shard 1 and shard 2 can both run story X's test while nobody runs story Y's → an axe test silently never runs, CI green. (A `--list` comparison on one machine cannot show this.) Fix: `.sort()` the ids in `storyIds()` so the partition is a function of the id set only (optionally a tools test that `storyIds` is sorted).

2. **LOW — playwright.config.ts:97 with ci.yml:168/210** — globalTimeout 12 min kills a healthy run that the old ~13–14 min test-time ceiling would have allowed. Scenario: job limit 15 min; setup ~1 min (Chrome), more on Edge (`--with-deps msedge` apt). The slowest observed step was 600 s → 2 min margin, which equals the spec's ≥2 min; a 20 % slower runner than the 600 s sample hits globalTimeout and fails a run that previously passed (the report upload does survive, which is the intent). Fix: accept knowingly, or 13 min with the ≥2 min gap to timeout-minutes 15 (setup then eats margin); better, measure Edge setup time before fixing the number.

3. **LOW — tools/ci-browser.test.mjs:121-122, :130** — The new checks are looser than criteria 1–2 and cover only today's files: `/^\s*timeout:\s*30_000,/m` would match a nested `timeout: 30_000,` (e.g. in a project's `use`), so the top-level value could change and still pass; `fullyParallel` is caught only as literal `true` (`fullyParallel: isCi` passes); criterion 1 "no other file changes mode" has no check scanning e2e/*.spec.ts for another `describe.configure({ mode: 'parallel' })`. Fix: match `fullyParallel` with any value other than `false`; scan every e2e spec for `mode: 'parallel'` against an allowlist of `a11y.spec.ts`; add a mutant each.

4. **LOW — apps/server/tests/db/recovery-store.db.test.ts:676** — The test is coupled to `to_jsonb(...)::text` spacing (`"handle_claimed_at": "..."`). The fixture `tests.fx_recovery_answers_json` uses `to_jsonb(a)::text`, so it works today; if the fixture moves to `json` or compact text, `expect(claimedA).toBeDefined()` fails with a clear message (loud, not silent). Fix: `JSON.parse(rowA)` and read the field.

## Checked, no finding
- a11y shared state: no hooks, no module state; `test.use` file-level read-only; the harness-control test mutates its own page only; each test has its own context/page; `ids` is a pure read of the built index at load (same in every worker); the `already running` retry is per page (40×250 ms = 10 s, within 30 s) and per-page state isn't shared. Worker count unchanged (2), so concurrency doesn't rise.
- Other files: only a11y changed mode; app-shell-guard-build serial untouched; 240/300 s limits unchanged; `timeout: 30_000` equals Playwright's default (declaration, no behaviour change); retries unchanged.
- Dropped/duplicated across shards (other than finding 1): matrix and `--shard=N/3` untouched and still guarded; no file lists introduced.
- globalTimeout: 0 locally; on timeout Playwright writes the report and the upload step runs on `!cancelled()`, so the report survives (a job-level cancel would lose it — hence the margin; see finding 2).
- c5 fix: A's `handle_claimed_at` is A's token iat in whole seconds (`claimedAt = new Date(claim.issuedAt*1000)`); B's token iat = A's claim; B's own claim (B's iat at its save, after A's) ≥ A's iat, so `needsRekey` (`own.handleClaimedAt < iat*1000`) is false in every case including same-second — no race (barring a backwards wall-clock step, not realistic). No rekey, B's own handle, wrong answers → 401; the asserted 401 is unchanged. The `extra` override of `iat` works (`extra` spread last in `payloadOf`).
- Criterion 21 is not asserted by this test; it now excludes the "newer" case rather than asserting it — correct for c5 only because criterion 21 has its own tests (pgTAP 31_recovery_policies.sql c21 and other recovery-store tests). It hides no defect: the original flake was the designed release of A's handle by a newer token carrying A's email. The expected 401 traces to the c5 criterion, not a source constant.
- No secrets, debug output or commented-out code; no existing test removed or weakened.

## Done · Artifact · Findings · Open · Next owner
- Done: review of P3, one round. Artifact: CRITIC's reply (saved here). Findings: 1 medium, 3 low.
- Open: Q1 — keep the globalTimeout margin at the spec's ≥2 min minimum? Default: keep (measured 600 s vs 720 s).
- Next owner: BUILDER for finding 1 (and 3 if wanted); CRITIC re-checks finding 1 only.

## ORCHESTRATOR's handling (18.10.2026)
- 1: `storyIds()` returns sorted ids; a tools test pins it. 2: kept at 12 min knowingly (slowest P3-head step 484 s = 49 % headroom; 600 s was the old a11y-in-one-worker tail that P3 removes); recorded in measurements.md. 3: tightened with mutants. 4: JSON.parse.

## Re-check (CRITIC, finding 1, against 8c32ccc) — CRITIC's text, saved by ORCHESTRATOR (its Write was refused)
State: **fixed.** `storyIds()` (e2e/helpers.ts:18-21) ends in `.sort()` — default code-unit sort, so the order depends only
on the id strings; every shard's own Storybook index yields the same sequence and the position-based dealing of
a11y.spec.ts tests is consistent across shards. Guard: tools/ci-browser.test.mjs:258 asserts the `}).sort();` ending; the
mutant "storyIds unsorted" (line 281) shows it fails when removed. Other consumers: every storyIds/storiesOf use in e2e/
checked — most iterate; length checks and `.find(...)` are order-independent. Index-dependent uses: `TOPBAR[0]`
(part-f.spec.ts:98, :111) is still `shared-topbar--default` ("default" sorts before "with-actions", matches source order;
the tests need only the Hamburger); `BOTTOMNAV[0]` (part-f.spec.ts:291) changes from ThreeItems to FiveItems — the resize
test is generic over bar and rail, unaffected. New defects introduced by the fix: none. Next owner: ORCHESTRATOR.
