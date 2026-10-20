# Bootstrap — the steps that need `postgres`

Everything else goes through CI migrations as `app_owner`. These scripts are the only things that run as
`postgres`, once per environment. The complete list is in `.claude/knowledge/data-model.md` → "The `auth.users`
anchor and bootstrap steps". Anything else that needs `postgres` is a `DECISION REQUEST`, not a new file here.

| Step | File | When |
|---|---|---|
| 1 | `01-roles.sql`, then `01-roles-check.sql` | before the first migration (before I1) |
| 2 | `02-anchor-fk.sql`, then `02-anchor-fk-check.sql` | after the identity migration (`20261014100000_identity_schema`), before F1.4 deploys |
| 3 | `03-cron.sql`, then `03-cron-check.sql` | after the migration that creates `nestly.purge_held_content()` (`20261018200000_feed_interactions`) |

## Who runs it, where

- **nestly-preview:** Afik in the Supabase SQL Editor, or an agent through `node tools/db-preview.mjs <file>`.
  The tool refuses every target except preview.
- **nestly-prod:** Afik only, in the SQL Editor (CLAUDE.md, reserved item 2). No agent and no tool has a path there.
- **CI (`db` job in `.github/workflows/ci.yml`):** every run builds a disposable `supabase/postgres` database and runs
  step 1 there as `postgres`, then step 2 twice and its check, with random per-run passwords. It never touches a
  real environment.
- Order: preview first, then check it. Prod after that.

## Step 1, in order

1. Open the SQL Editor (it runs as `postgres`). Paste `01-roles.sql` and run it. It is one transaction: it either
   completes or changes nothing. It is safe to run again.
2. Set the passwords. Type them in the editor yourself. They never go in a file, the repo or a chat:
   ```sql
   alter role app_owner  password '…';
   alter role app_server password '…';
   ```
   Until you do this, neither role can log in. `app_jobs` is NOLOGIN for now and gets no password (see the header
   of `01-roles.sql`).
3. Run `01-roles-check.sql`. Expect 4 rows, all with `ok = true`. The expected values are in its header.
4. Wait about 20 seconds after setting a password before you use it. The pooler caches role credentials.
5. Put the `app_owner` connection string in the GitHub environment (`db-preview` / `db-production`). The
   `app_server` one goes to Vercel when I1 needs it. The password in the URL must be URL-safe
   (percent-encode any special character), or use letters and digits only.

## Step 2, in order

The anchor's FK: `nestly.users (id)` → `auth.users (id)`, **ON DELETE RESTRICT** (Afik, 13.10.2026). From then on, an
Auth user who still has a Nestly account cannot be deleted from the dashboard: the Nestly rows go first.

1. Check that the migration has run: `nestly.users` exists (the `migrate` workflow applies it after merge).
2. Open the SQL Editor (it runs as `postgres`). Paste `02-anchor-fk.sql` and run it. One transaction; safe to run again.
   A second run reports "already present and identical" and changes nothing.
3. Run `02-anchor-fk-check.sql`. Expect one row with `ok = true`. The expected values are in its header.

If it stops with `differs` or `unexpected FK`: something other than this script changed the anchor. It is never
repaired silently. Stop and report it.

## Step 3, in order

The purge schedule: pg_cron runs `nestly.purge_held_content()` daily at 03:17 UTC, as `app_jobs` (rule 6).

1. Check that the migration has run: `nestly.purge_held_content()` exists.
2. Open the SQL Editor (it runs as `postgres`). Paste `03-cron.sql` and run it. One transaction; safe to run again (the
   job is updated in place). It enables `pg_cron`, gives `app_jobs` USAGE on schema `cron`, and schedules the job as
   `app_jobs` through a temporary SET membership that it revokes before it commits.
3. Run `03-cron-check.sql`. Expect one row with `ok = true`. The expected values are in its header.
4. The first `succeeded` row in `cron.job_run_details` for the job proves it runs (E1 in
   `.work/i3-rest-schema/schema.md`): on nestly-preview, look the next day, before running this on prod.

Undo: `03-cron-down.sql` (the extension stays). Run it before the down script of `20261018200000_feed_interactions`,
which drops the function the job calls.

## Connecting as a custom role through the pooler

The pooler user name is **`<role>.<project-ref>`**, for example `app_owner.xmihorrkegrdlbhpktny` on nestly-preview.
The prod ref is in the dashboard under Project Settings.

- Migrations (`app_owner`) use **session mode, port 5432**.
- The request server (`app_server`) uses **transaction mode, port 6543** (data-model.md rule 5).

A successful login is the only proof that a password is set. SQL cannot show it here.

## If the script stops with an error

- `must run as postgres`: you are not connected as `postgres`.
- `SUPERUSER, BYPASSRLS or REPLICATION` / `unexpected membership`: something outside this script changed the
  roles. The script never repairs this silently. Stop and report it. It is an incident, not something to re-run
  past.

## Rollback

Step 2: `alter table nestly.users drop constraint users_id_fkey;` as `postgres` or `app_owner`. Only `postgres` can
add it back (step 2 again). While it is absent, nothing ties a Nestly account to its Auth user.

Step 1 is reversible **only until `app_owner` owns something**, which happens at the first migration:

```sql
begin;
do $$ begin execute format('revoke create on database %I from app_owner', current_database()); end $$;
revoke app_owner from postgres;
drop role app_jobs;
drop role app_server;
drop role app_owner;   -- its remaining memberships go with it
commit;
```

After the first migration, dropping `app_owner` means dropping or reassigning everything it owns, which destroys
the product schema. That is a destructive change and needs Afik (CLAUDE.md, hard rule 7). Changing a grant later
means editing `01-roles.sql` and re-running it. The script adds and updates grants but never revokes them, so a
revoke is written by hand and goes through DATA ARCHITECT.
