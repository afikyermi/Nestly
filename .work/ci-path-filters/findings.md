# findings — ci-path-filters (PR 18), CRITIC (opus), 14.10.2026

verdict: Validated with Concern

1 (medium) ci.yml:44-54 — `git diff --name-only` quotes paths with non-ASCII (core.quotePath), so a Hebrew-named migration or test under supabase/ never matches → db=false, RLS gate and pgTAP skipped; same for web. Fix: `git -c core.quotePath=false diff -z --no-renames --name-only HEAD^1 HEAD`, NUL-separated read; any path starting with `"` sets web=true and db=true; test with a quoted path. → fixing before merge.
2 (medium) ci.yml:51 — `.nvmrc` sets only web; Spec addendum 3's "Node/TS base config" includes it; the db job runs under it. Fix: both web and db; add to mustTrigger. → fixing before merge.
3 (medium) tests check the script's wording, not its behaviour: an empty diff (`HEAD HEAD`, `--diff-filter=M`, a pathspec), `db=""`, a broader earlier `case` pattern, a failed pipe without pipefail, `web=false` default all pass. Fix: a behavioural test that runs the `changes` script with bash against a temp repo with a merge commit (add, delete, rename out, quoted name, .nvmrc, apps/web-only; push event; no HEAD^2) and asserts GITHUB_OUTPUT; web default and patterns too. → before merge.
4 (low) the Playwright cache path stays empty for branded channels (chrome, msedge install under /opt) → debt.
5 (low) if the `changes` job itself fails, db/browser/storybook are skipped (implicit success()); visible today because merges need green `gh pr checks`; make `changes` required / document required checks → debt (Afik's GitHub settings).

Checked, no finding: merge-commit diff on pull_request with fetch-depth 2; renames and deletions listed; supabase/tests, supabase/ci, apps/server/tests matched; no tools/ used by db; set -eu, no swallowed failure; push → all true; no injection path that matters; caches scoped to the PR ref; helper extraction keeps every assertion.

## Re-check (CRITIC, opus) at b5bc826 — the one re-check
verdict: Validated with Concern. 1 closed (`-z` raw paths, NUL read, git's status decides, `"` backstop; proven by running the step). 2 closed (.nvmrc sets both; asserted behaviourally). 3 closed (every listed broken variant fails a behavioural test; the harness rejects always-false and non-zero scripts). Residual, not reopened: the run test skips when bash or git is missing — on ubuntu-latest both exist; hardening: fail instead of skip when CI is set (debt). 4 and 5 stay in debt.
