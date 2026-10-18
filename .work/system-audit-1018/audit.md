# System audit — 18.10.2026 (after P1–P6, step 11 and the scroll-padding item)

Afik's request: a fresh outside look at the last 24 hours of process, rules, CI and settings changes. Every finding has its
evidence. "Fixed" = merged in this session with CRITIC and green CI. "⭐" = recommendation waiting for Afik. "Plan" = large,
recorded, not built.

## 1. What is not good, or will not work as planned

| # | Finding | Evidence | Status |
|---|---|---|---|
| A1 | **`part-status` (P1) cannot say "green" for a correct PR.** On merged, green records PR #63 it took ~13 min and printed 9 blockers: "CI run on current PR head: missing" (it ran), "Pagination limit reached: actions/runs?branch=main" (main has >1000 runs; always), the four expected skips, E missing and "no Preview" on a records PR, an old cancelled `preview-e2e` on 3aab0c7. | `node tools/part-status.mjs 63`, 18.10 08:36 UTC | **Plan** (P1.1): look only at the newest main runs; skip-with-reason from the `changes` filter automatically; a records/tooling PR is "no Preview by policy", not "E missing"; after merge, read CI by SHA not by PR link. Until then merges ran on `gh pr checks` + CRITIC (Afik's instruction). |
| A2 | **Edge sees flakes only after a merge.** Two red mains today, both Edge-only, both listed flakes: 39098646554 (c84ac76: user-profile-actions:386 and user-profile:183) and 39102943703 (ef9de45: user-profile:183). | `gh run list --branch main` | **Fixed**: PR 64 (c27 sync), PR 65 (c30 toBeFocused, signIn wait) — Edge 20/20 in CI proof. Rule "Unstable tests" now in workflow. |
| A3 | **Byte budgets are at the edge.** workflow.md 36,998 / 37,000; decisions.md 8,187 / 8,192. Three times today a rule addition had to delete words elsewhere; once a meaning was lost and CRITIC caught it (PR 65 F4). | `node tools/check-budgets.mjs` | **⭐** Raise workflow.md to 40,000 and decisions.md to 9,000, or move "Batched approvals"/"Closing a part" detail to a linked file. Budgets are P2 rules: Afik's call. |
| A4 | **CRITIC cannot write `findings.md`.** The harness refuses subagent report files; 25 "Write refused" notes in today's findings files; ORCHESTRATOR saves each by hand. workflow.md and critic.md still say CRITIC writes it. | `.work/*/findings*.md` | **⭐** Make the contract "CRITIC returns the text; ORCHESTRATOR saves it verbatim" (critic.md + workflow step 9). Agent definition = Afik approves. |
| A5 | **Quarantine expiry is not enforced by CI.** A skipped test tagged `flaky:<ID>:<date>` expires only by a human check at part close. | CRITIC PR 65 re-check #3 | **Plan**: a 20-line check in `test:tools` that fails on an expired `flaky:` tag. |
| A7 | **A wait that reads only checks misses a merge conflict.** PR 65 sat `DIRTY` ~30 min after PR 66 merged (both appended to debt.md): GitHub builds no merge commit, so no `pull_request` CI ever started; the wait loop looked for check results only. `part-status` did not read the merge state either. | `gh pr view 65 --json mergeStateStatus` → DIRTY, "no checks reported", 11:21 UTC | **Fixed** (this PR): part-status blocks on `mergeable_state: dirty` with the cause and the fix (merge the base in, no force push); unknown mergeability is a stated limitation; workflow → Every wait: "a CI wait also reads the merge state". |
| A6 | **Password "not by scanning" is false** (5 MB → too_big + custom): the refine runs after the raw bound. Low (web-only). | `node … safeParse`, PR 65 | **⭐** bug-fix part: `abort` after the raw bound, then the test asserts exactly `['too_big']`. Product code → its own part. |

## 2. What may collide (between the changes, with what was, with I3)

| # | Finding | Evidence | Status |
|---|---|---|---|
| B1 | **I3 F3.0 (new tables) vs the Preview cleanup preflight.** The cleanup refuses when the set of `nestly` tables changes (it did on 16–17.10 after F2.0). With P6, the migration reaches nestly-preview on merge, before any code; the next E's cleanup then refuses until main's cleanup knows the tables. P5 ("cleanup across schema transitions") is not built. | incidents.md 2026-10-17 "preview-e2e-cleanup on main"; comparison.md P5 | F3.0's schema PR must carry the cleanup update in the same PR (allowed: tools are not product paths). **Plan**: P5 before I3 ∥ I6. |
| B2 | **I3 ∥ I6 on one Preview DB.** P7 (one coordinated Preview cycle for two sessions) is not built: two candidates' E runs serialise on the `preview-e2e` concurrency group, but a schema merge from one session can land between the other's E and its cleanup. | comparison.md P7; preview-e2e.yml `concurrency: preview-e2e` | **No for parallel** until P7. One session at a time is safe. |
| B3 | **Vercel quota with two sessions.** Since P4 (05:36): 5 deployments in ~5 h (4 Production on merges, 1 Preview) — PRs #63–#66 created none. Estimate for I3 ∥ I6: ~3 per part (ready push, a fix push, the merge) × 6–12 parts/day ≈ 20–40, plus records merges: well under 100. Every merge to main still deploys Production, records too. | GitHub deployments API, 24 h | OK. Keep records with the part PR (one merge, one deploy). |
| B4 | **Ruleset × process.** `schema-gate` required on main: verified on PR 66 (appeared, passed, MERGEABLE). Records-only rule already says "never a direct push to main". No conflict. ORCHESTRATOR's private memory note still said records may go directly to main — corrected. | `gh api …/rules/branches/main`; workflow.md:417 | Fixed (memory). |
| B5 | **Two sessions × the same record files** (WORKPLAN, decisions, debt, budgets at the edge): parallel PRs will conflict and race the byte budget. | today: every records commit needed budget trimming | **⭐** one owner for records per day (the I3 session), the other session writes only its `.work/<slug>/`. |
| B7 | **Shared records files conflict between parallel PRs.** debt.md, incidents.md, noise.md, escapes.md are appended by every part; WORKPLAN, decisions.md (index) and decisions/<month>.md by every records step. Two PRs → a conflict on the second (A7), and with I3 ∥ I6 on most merges. | PR 65 × PR 66 (debt.md), 18.10 | **⭐ Prevent, not resolve:** (1) the append-only logs become one file per entry — `debt/`, `incidents/`, `noise/`, `escapes/` with `<date>-<slug>.md` — and a tool renders the readable list (like `build-srs-index`); two PRs add different files and never conflict. (2) WORKPLAN, the decisions index and the month file get one owner per day (the I3 session); the I6 session writes only its `.work/<slug>/` and the owner folds it in one records PR. (`.gitattributes merge=union` alone is not enough: GitHub's own mergeability check can still report the conflict.) **Plan**: build before I3 ∥ I6, with P7. |
| B6 | **Stale branches.** 42 remote branches; auto-delete now covers merged PRs only. `claude/guard-allowlist-implementation-xcv55m` is from 13.10 04:44 UTC (cloud session, PR #6 closed unmerged); `ccr-21b5fcdf-l5yns9` (16.10, no PR); `wip/i2-*` (17.10, 200+ behind); `ready/p4-proof`. The guard blocks remote deletes; cloud sessions cannot delete either. | `git ls-remote --heads origin` | **⭐** Afik deletes them by hand (list in the PR). |

## 3. Where the process actually stopped me today

| # | Stop | What happened | What would have helped |
|---|---|---|---|
| C1 | Unstable tests | 2 red mains (Edge), a red P6 `db` (c21 race), ~1 h of diagnosis | Fixed (A2, rule). |
| C2 | DB only in CI | the c21 race and the 5× proof needed CI runs (+2 temporary commits, ~17 min each) | ⭐ Docker Desktop on Afik's machine (WORKPLAN item 4) — local `test:db`. |
| C3 | Vercel quota | the night's pushes hit the 100/day limit again (23:42 UTC) — no E for ~6 h | Fixed by P4 (B3). |
| C4 | Guard / classifier | the remote delete of `ready/p4-proof` (guard, by design); last night the session classifier refused editing vercel.json until Afik's explicit approval | By design; nothing to change. |
| C5 | Afik's cut message | step 7 arrived cut; stopped and asked | Nothing to change (stopping was right). |
| C6 | Waiting without a signal | CI waits were polling loops: the PR monitor wakes only on failures with auto-fix on, and is off | ⭐ allow auto-fix notifications on bound PRs, or accept polling with a stopwatch (as today). |
| C7 | `part-status` | not usable (A1); every close ran on `gh pr checks` | Plan P1.1. |
| C8 | A silent stall | PR 65 waited ~30 min on a conflict that stops CI from starting (A7) | Fixed (A7). |

## Ready for I3?

**Yes for I3 alone (one session), with two conditions:** F3.0's schema PR carries the cleanup update for its new tables
(B1), and the I3 session closes parts on `gh pr checks` + CRITIC + E until P1.1 (A1). **No for I3 ∥ I6** until P5, P7 and the records split (B1, B2, B7).
