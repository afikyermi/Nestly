# P4 findings (CRITIC, round 1)

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write.

## Findings

1. **MEDIUM — tools/vercel-branch-policy.test.mjs:65-69** — The "vercel.json carries POLICY" test is a permanent pass when the block is absent. Scenario: Afik's step is never done, or a later vercel.json edit drops `git.deploymentEnabled` → `readPolicy` returns undefined → `t.todo()` + return → exit 0. CI stays green while every branch deploys again (the 100/day limit regresses) with no failing signal. Node's runner counts a passing todo test as pass in its totals (only flagged "# TODO"); spec criterion 3 says "never a pass". Fix: after Afik's step, make undefined a hard failure (delete the todo branch) in a follow-up; until then record the pending step on WORKPLAN's waiting list.

2. **LOW-MEDIUM — tools/part-status.mjs:77-80** — The blocker is computed from the intended constant POLICY, not from what vercel.json actually carries or whether a Preview exists. Scenario A: today, before Afik adds the block, a PR from `claude/x` or `ccr-*` still gets a Preview and E success, yet part-status reports "Head branch … gets no Preview" — a false blocker that prevents closing the part except via `--no-preview` (which wrongly waives E) or an unnecessary `ready/` push. Scenario B: it also fires when E is already `success` on that head. Fix: only raise it when `e.state !== 'success'` (or attach it as advice to the E blocker), and/or read the real policy (`readPolicy` from vercel.json at the PR head) so it matches the repo's actual state.

3. **LOW — tools/part-status.mjs:77-80** — Uses `headRef` only; a fork PR whose head ref is `main` or `ready/x` is treated as deployable although a fork's branch never matches this repo's rule. Fix: compare `pull.head.repo.full_name` with the base repo and treat a mismatch as no Preview. Low (solo project).

4. **LOW — tools/vercel-branch-policy.mjs:89-93** — `unsupported()` does not reject a leading `#`; minimatch treats `#…` as a comment matching nothing, while this matcher treats it as literal. Scenario: a future POLICY key starting with `#` would be mis-evaluated. No such key today. Fix: add `#` to the unsupported check.

5. **LOW (open question, not a defect in the diff)** — Records-only PRs from `chore/*`/`records/*` will have no Vercel status at all. If branch protection or a ruleset lists a Vercel context as required, those PRs cannot merge (previously an ignoreCommand skip still posted a status). ORCHESTRATOR can confirm no Vercel context is required before Afik's step; part-status already reads the required list.

## Checked, no finding
- Matcher vs minimatch for `**`, `main`, `ready/**` and this repo's branch names: correct (trailing `**` needs a segment so `ready` does not match; `*` stays in a segment; dot handling moot since git forbids leading-dot components; regex escaping covers `. ^ $ |` and `unsupported` rejects every other regex-special char).
- Candidate false negatives: `ready/x`, `ready/a/b` match `ready/**=true` → deploy despite `**=false` (any true wins); `main` deploys → production deploy unaffected.
- E: preview-e2e runs on `deployment_status` for Preview, checks out `deployment.sha` → a push to `ready/x` at the PR head SHA associates correctly; the PR must be opened from the `ready/` branch, which the blocker enforces.
- ignoreCommand: `startsWith('ready/')` after the `main` check; `readyish/x`, `ready` do not build; everything else unchanged. Under POLICY non-candidate branches never reach the ignoreCommand; no prefix trick makes a non-candidate build.
- Existing tests: none weakened; the diff only adds tests and the `test:tools` entry; the mutant test can fail.

## Done · Artifact · Findings · Open · Next owner
- Done: review round 1. Artifact: CRITIC's reply (saved here). Findings: 1 medium, 1 low-medium, 3 low.
- Open: live proof of criterion 6 after Afik's vercel.json step; Vercel's real matcher verified against docs only, not live; whether a Vercel status is a required check (item 5).
- Next owner: BUILDER for items 1–2, then CRITIC re-check of items 1–2 only.

## ORCHESTRATOR's handling (18.10.2026)
- Item 5: checked — `main` has no branch protection and no rulesets (`gh api …/branches/main/protection/required_status_checks` → 404 "Branch not protected"; `rules/branches/main` empty). No required Vercel context.
- Items 1–4: fixed in the commit after this file (see the PR); CRITIC re-checks items 1–2.
