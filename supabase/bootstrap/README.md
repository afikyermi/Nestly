# Bootstrap — the steps that need `postgres`

Everything else goes through CI migrations as `app_owner`. These scripts are the only things that run as
`postgres`, once per environment. The complete list is in `.claude/knowledge/data-model.md` → "The `auth.users`
anchor and bootstrap steps". Anything else that needs `postgres` is a `DECISION REQUEST`, not a new file here.

| Step | File | When |
|---|---|---|
| 1 | `01-roles.sql`, then `01-roles-check.sql` | before the first migration (before I1) |
| 2 | the anchor's FK to `auth.users` | after the first table's migration. Not written yet: it comes with the first table |
| 3 | extensions, pg_cron jobs | when needed |

## Who runs it, where

- **nestly-preview:** Afik in the Supabase SQL Editor, or an agent through `node tools/db-preview.mjs <file>`.
  The tool refuses every target except preview.
- **nestly-prod:** Afik only, in the SQL Editor (CLAUDE.md, reserved item 2). No agent and no tool has a path there.
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
3. Run `01-roles-check.sql`. Expect 3 rows, all with `ok = true`. The expected values are in its header.
4. Wait about 20 seconds after setting a password before you use it. The pooler caches role credentials.
5. Put the `app_owner` connection string in the GitHub environment (`db-preview` / `db-production`). The
   `app_server` one goes to Vercel when I1 needs it.

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
