# Findings — i1-prep (branch `chore/i1-prep`)

**CRITIC (opus), 12.10.2026 — verdict: Not Ready.** Reviewed 7e53c75 (roles bootstrap), e92d7f7 (Vercel ignoreCommand),
6e429c0 (db-check workflow), 1156356 (decisions). Saved by ORCHESTRATOR (CRITIC's write was blocked).

| # | severity | file | finding | decided fix |
|---|---|---|---|---|
| 1 | high | `.github/workflows/db-check.yml:50-53` | psql/libpq error text can repeat parts of a malformed URL, including the password; GitHub masks only the whole secret, and the repo is public | psql's stderr never reaches the log; a fixed message on failure. README: the password must be URL-safe (percent-encoded) |
| 2 | medium | `.github/workflows/db-check.yml:1-5, 55-69` | the check does not prove the URL belongs to the chosen environment's project; a prod URL in db-preview would pass, and in I1 `migrate` would apply to prod without approval | ORCHESTRATOR: map each environment to its project ref in the workflow (refs are not secret; both are in WORKPLAN) and fail unless the URL's user is exactly `app_owner.<ref>`, parsed without printing. The same check goes into I1 `migrate` |
| 3 | low | `.github/workflows/db-check.yml:41-53` | no `sslmode`; psql's default `prefer` can fall back to plain text | `PGSSLMODE: require` |
| 4 | low | `supabase/bootstrap/01-roles.sql:126-129` vs `data-model.md` rule 5 | rule 5 says app_owner holds `authenticated` "and nothing else outside the product schema", but it also holds CREATE on the database (needed, approved in infra-7.3) | DATA ARCHITECT rewords rule 5 to name the grant; CRITIC validates |

Checked with no findings: `01-roles.sql` against rules 1, 2, 5, 6 and the anchor paragraph; `01-roles-check.sql`;
db-check's trigger, permissions, input handling and environment protections; `vercel-ignore.mjs` (exit 1 builds, 0 skips).

**Open (CRITIC QUESTION, default accepted):** do Vercel builds cancelled by the ignoreCommand count toward the Hobby
daily limit? Assumed yes until checked; ORCHESTRATOR checks the deployment count after the next busy day. If they count,
`git.deploymentEnabled` is the fallback.

## Re-check — CRITIC (opus), 12.10.2026 — verdict: Validated

Fixes 78b6725 (findings 1–3, README line) and e9e0c46 (finding 4, rule 5 wording) checked against
`git diff 1156356..HEAD`. All four closed; nothing new at high or medium. CRITIC validates the rule 5 knowledge
change (proposed by DATA ARCHITECT). Residual, not findings: a libpq query parameter (`?user=`, `?sslmode=`) in the
URL could override the shell checks — only a deliberately misleading secret, by someone who can already edit
environment secrets. Nit fixed by ORCHESTRATOR: the header comment now says one SELECT statement.
