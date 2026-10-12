# Result — i1-prep (preparation for I1)

- **Execution:** Succeeded
- **Quality:** Good

**Planned vs actual:** Afik's decisions of 12.10 — Vercel builds, the guard allowlist decision, and the I1 database
preparation done by Afik step by step in chat. PR 4 (https://github.com/afikyermi/Nestly/pull/4) added
`supabase/bootstrap/` (roles script, check, README), `.github/workflows/db-check.yml`, `tools/vercel-ignore.mjs` with
tests and `vercel.json`'s `ignoreCommand`, and the rule 5 wording in `data-model.md`.

**SRS trace:** none. Infrastructure and agent-team rules; `decisions.md` holds the three decisions of 12.10.

**Evidence:**
- CRITIC (opus): Not Ready (one high — psql errors could print part of the password in a public log), fixed, then
  Validated (`findings.md`). TEST ENGINEER: 17 tests for the Vercel script.
- GitHub Actions on PR 4: every check green; merged as bf1be63.
- Afik ran `01-roles.sql` and set the `app_owner` and `app_server` passwords on nestly-preview and nestly-prod;
  `01-roles-check.sql` returned 3 rows, all `ok = true`, on both.
- Environment secrets `APP_OWNER_DATABASE_URL` exist in `db-preview` and `db-production` only (checked through the
  GitHub API: names, never values); `db-production` requires Afik's approval and deploys from `main` only.
- `db-check` passed on both environments (runs 38306396829 and 38306995203), after two failed logins resolved by Afik
  (`incidents.md`).

**Carried:** `app_server`'s connection string goes to Vercel when I1 needs it · the anchor FK (bootstrap step 2) with
the first table · the I1 `migrate` workflow repeats db-check's URL checks (CRITIC) · leftover `probe_*` roles on
preview (`debt.md`) · whether skipped Vercel builds count toward the daily limit.
