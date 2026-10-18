# P4 — prevent unneeded Vercel deployments by branch policy (spec)

Approved: Afik, 17.10.2026 plan (`nestly-review/comparison.md` P4) and the overnight instructions of 18.10.2026, task 3.
Path: Light/Standard tooling (no product code, no schema); CRITIC reviews.

Intent: a cancelled deployment (ignoreCommand) still counts toward Vercel's 100-a-day limit; `git.deploymentEnabled`
prevents creation. Work, records and cloud-session branches create no deployment; `main` and candidate branches
`ready/<part>` do; a real candidate keeps its Preview on the right SHA and E (`preview-e2e`) on it.

Criteria:
1. `POLICY` = `{"**": false, main: true, "ready/**": true}`; `deploys()` mirrors Vercel's documented semantics (unmatched →
   deploy; any matching true → deploy) and minimatch for the supported glob subset; unsupported syntax fails.
2. Repository branch names (`ccr-*`, `claude/*`, `codex/*`, `chore/*`, `feat/*`, records) do not deploy; `main`, `ready/x`,
   `ready/a/b` do; mutants of the policy are caught.
3. `vercel.json` carries exactly POLICY. The agent may not edit `vercel.json` (classifier); until Afik adds it, the test is
   a reported TODO, never a pass.
4. `tools/vercel-ignore.mjs` builds every `ready/**` ref (pushed before its PR exists); other behaviour unchanged.
5. `tools/part-status.mjs`: a PR whose head branch gets no Preview under POLICY is a blocker naming `ready/<part>`; not when
   `--no-preview` applies or the head ref is unknown.
6. Precondition: Claude Code cloud sessions can push a new `ready/<part>` branch without force push (docs: the GitHub proxy
   "doesn't limit which branches a push can update"; rejects branch deletion). Live proof after Afik's vercel.json step.
Not in scope: workflow.md/skills text (P2 files; after P2 merges), Vercel/GitHub settings, main records-only deploys.
