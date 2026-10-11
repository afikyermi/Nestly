# recommendation — 7.3 infrastructure: migration path, runtime connection, Data API

**Author:** DATA ARCHITECT · 11.10.2026 · **Status:** recommendation only. Nothing here is decided; every
decision is a numbered `DECISION REQUEST` at the end.

**Tags:** `[F1]`–`[F6]` = the facts verified on 11.10.2026 (task brief) · `[repo]` = read in this repo ·
`[PG]` = standard PostgreSQL behaviour, not re-fetched today · `[A]` = assumption, not verified. Every `[A]`
that matters has a test in (d).

---

## (a) Migration path

### Fixed inputs

- Migrations are SQL in `supabase/migrations/`, the Supabase CLI layout. Drizzle migrations under `apps/server`
  were rejected `[repo: decisions.md "Repository layout and naming"]`. So the tool is the Supabase CLI
  (`supabase db push --db-url …`) in every option below. Only the connection, the host and the role change.
- Preview receives a feature's migrations from its branch. Production receives them only on merge
  `[repo: decisions.md "Hosting", preview]`.
- The direct connection is IPv6 only on Free `[F2]`. The pooler is IPv4 in both modes `[F3]`. Session mode
  supports everything a direct connection does: session state, advisory locks, prepared statements `[F4]`.
- Today CI uses no secrets, and the workflow says so `[repo: .github/workflows/ci.yml:1]`. Any CI option adds
  the first secrets to a public repo.
- Agents cannot reach a database: `psql` and `curl` are denied, `supabase` is set to ask
  `[repo: .claude/settings.json]`.

### Options

| # | Option | Cost | Risk | Reversibility | Rule 5 |
|---|---|---|---|---|---|
| **1** | **CI (GitHub Actions) → session pooler :5432, as the owner role.** A separate `migrate` workflow, triggered by `push` and `workflow_dispatch` only. Two GitHub Environments: `preview` (feature branches) and `production` (main only, required reviewer: Afik). Each holds only its own connection string | $0 | Owner credentials sit in GitHub secrets on a public repo. They are not exposed to fork PRs `[A]`, and `pull_request_target` must be banned in this workflow. A paused Free project fails the job, which is loud and harmless. Session mode with a custom role is unverified `[F3]` → test T3/T5 | High: it is a workflow file and a connection string. Moving to direct or the add-on later is a one-line change | **Changes**: "never through the pooler" → "never transaction mode" |
| 2 | **IPv4 add-on → direct connection from CI** | Pro $25+/month plus about $4/month per project with the add-on `[F2]`. Both projects need it unless preview stays IPv6 (and then CI cannot reach it) | Same secret exposure as 1. Spends money in a phase decided at $0 `[repo: decisions.md "Hosting", cost]`. The swap from AAAA to A affects nothing, because nothing of ours uses IPv6 `[F2]` | Medium: the add-on can be turned off `[A]`, but the plan change is a billing decision | Unchanged |
| 3 | **Afik's machine → direct connection over IPv6** | $0 | Depends on his ISP having working IPv6 `[A, untested]`. Manual, so no record ties a migration to a commit. Easy to apply the wrong file to the wrong project. Owner credentials live on a laptop. Costs Afik's time on every migration | High | Unchanged in wording, but it implies "from a developer machine", which the hosting decision did not intend (production only on merge) |
| 4 | **CI → direct connection over IPv6**, if runners have IPv6 | $0 | Runner IPv6 is unverified, and community reports say no `[F5]`. Even if a probe passes once, it is not a documented capability `[A]` | High | Unchanged |
| 5 | **Supabase GitHub integration / Branching** | Needs Pro: Branching is not on Free `[repo: decisions.md "Hosting", prices]`. That deploy-on-merge needs Branching is `[A]` | Low technical risk, but money and a new external integration with write access to the database | Medium | Unchanged |
| 6 | Other: Management API SQL over HTTPS, or the dashboard SQL editor | $0 | A personal access token is account-wide, which is worse than a DB role. The SQL editor runs as `postgres` and leaves no record | — | — |

### Recommendation: option 1

It costs nothing, runs over a path documented for every plan `[F3]`, ties every applied migration to a commit,
and keeps production writes behind an approval that is enforced by GitHub, not by prose (hard rule 1). It does
not depend on the runner IPv6 question. When Supabase Pro arrives at I9 we can switch to the direct connection
in one line, without any redesign.

**Conditions that come with it** (BUILDER or Afik implement them; CRITIC reviews the workflow):

1. A separate workflow file from `ci.yml`. Triggers: `push` and `workflow_dispatch` only. Never `pull_request`
   or `pull_request_target`. `permissions: contents: read`.
2. Environment `production`: deployment branches limited to `main`, Afik as required reviewer. Environment
   `preview`: no reviewer. The availability of required reviewers on a public Free repo is `[A]` → T6.
3. SSL: `sslmode=verify-full` with the Supabase CA certificate, not plain `require` `[A: CA download available]`.
4. **Ordering risk.** Vercel deploys `main` on every push, independently of this workflow `[repo: WORKPLAN 7.4]`,
   so code can go live before or after its migration. Proposed convention, to be validated by CRITIC: every
   migration is compatible with the code already running (expand → deploy → contract). A breaking change goes in
   two merges.
5. Rollback is a forward migration. The Supabase CLI has no down migrations `[A]`. The reverse SQL is written in
   that feature's `schema.md` before the migration runs. Free has no backups
   `[repo: decisions.md "Hosting", cost — Pro "for backups"]`, so a destructive migration on production gets a
   `supabase db dump` first. It is an irreversible change, so it already goes to Afik.

### Which role applies migrations

| Role | For | Against |
|---|---|---|
| **R1 — dedicated `app_owner`** (proposed name): LOGIN, NOSUPERUSER, NOBYPASSRLS, owns the product schema and every object in it. `postgres` creates it once, in a bootstrap step Afik runs | A leaked CI secret reaches the product schema, not `auth`, `storage` or the Supabase internals. Ownership is explicit and checkable. Rule 1 "never the role that owns the tables" names one specific role | It needs grants that Supabase may restrict: `CREATE` on the database (for the CLI's `supabase_migrations` table), `USAGE` on `auth`, `EXECUTE` on `auth.uid()`, `REFERENCES` on `auth.users` (a profile FK). Extensions and pg_cron still need `postgres`, as a rare manual bootstrap. All `[A]` → T2, T5 |
| R2 — `postgres` | Works with no extra setup. It is the CLI default | `postgres` is Supabase's admin role and has broad rights, BYPASSRLS included `[A]`. A leaked CI secret then exposes everything, `auth.users` included. Tables owned by `postgres` mix product objects with platform objects |

**Recommend R1.** If T2 or T5 shows that a grant R1 needs is impossible on Supabase, fall back to R2 for the
blocked step only, and record it in `data-model.md`.

### Proposed wording of rule 5 (only if options 1 and R1 are chosen)

> | 5 | **Connection:** the request server uses Supabase's pooler in transaction mode (port 6543), postgres-js with
> `prepare: false`, one connection per function instance. **Migrations** run as `app_owner`, a separate owner
> role, from CI only, through the pooler in **session mode** (port 5432) or a direct connection — never in
> transaction mode, never at runtime, never from a developer machine against production. Production migrations
> run only from `main`, after Afik's approval on the GitHub `production` environment | transaction mode keeps
> no session state; DDL and the migration tool's locks need a session. A production write needs a person's
> approval that a tool enforces |

And replace the "Connections from functions" paragraph's sentence "Migrations: the direct connection is IPv6
only … which may change rule 5." with:

> Migrations: CI reaches the database through the session-mode pooler (IPv4), since the direct connection is IPv6
> only on Free. They move to the direct connection when the IPv4 add-on is bought (I9 or later). Decided in 7.3.

---

## (b) The server's runtime connection: transaction mode as `app_server`

**Confirmed: the identity transaction in rule 3 is safe under transaction pooling, provided four conditions
hold.**

Why it is safe: in transaction mode the pooler gives a server connection to one client for exactly one
transaction `[F4]`. `SET LOCAL` and `set_config(…, true)` last until that transaction's COMMIT or ROLLBACK and
then revert, rollback on error included `[PG]`. The next client on that backend starts as plain `app_server`,
with no role and no claims. Because `app_server` inherits nothing (rule 2), a query that reaches it without an
identity fails. It does not leak.

The four conditions:

1. **Never anything session-level**: no plain `SET ROLE`, `SET`, `set_config(…, false)`, `RESET`, session
   advisory locks, LISTEN/NOTIFY or temp tables `[F4]`. These would either fail or leak between users. CRITIC
   checks every diff for them. A lint or grep rule is cheap.
2. **The identity is set inside the same transaction as the work**: `BEGIN` → `SET LOCAL ROLE authenticated` →
   `select set_config('request.jwt.claims', $1, true)` → queries → `COMMIT`. A single entry point in
   `apps/server/src/db/` runs it; repositories receive the transaction and never the root client.
3. **The claims are the verified token's, with `role` overwritten as `authenticated`** (rule 3). They are passed
   as a bound parameter, never interpolated. With `prepare: false`, postgres-js still sends parameters as unnamed
   statements, which transaction mode accepts `[A]` → T4.
4. **`SET LOCAL ROLE` passes through Supavisor** and `auth.uid()` reads `request.jwt.claims` `[A]` → T4.

**Version item closed**: PostgreSQL 17.11 `[F1]` ≥ 16, so rule 2 uses `GRANT … WITH INHERIT FALSE, SET TRUE`,
not NOINHERIT. One open point: on PG 16+, granting `authenticated` requires ADMIN OPTION on it. Whether Supabase's
`postgres` holds it is `[A]` → T2. **If it does not, rule 2 cannot be built as written, and that becomes a
blocker for Afik.**

**Configuration Drizzle and the driver must have** (as a checklist for BUILDER, not code):

| Setting | Value | Source |
|---|---|---|
| Host / port | the shared pooler, port **6543** (transaction mode) | `[F3]` `[F4]` |
| User | `app_server.<project-ref>`, per environment | `[F3]`; works for a custom role `[A]` → T3 |
| Driver | postgres-js, `prepare: false` | rule 5, `[F4]` |
| Pool | `max: 1` per function instance, client created once at module scope | `[F4]`, Hosting "one per instance" |
| SSL | `verify-full` with the Supabase CA; at minimum `require` | `[F4]` (require); verify-full is my recommendation |
| Timeouts | short `idle_timeout` and `connect_timeout`, and `max_lifetime` set, so frozen instances release clients | `[A]`: tune in the first feature |
| Drizzle | `drizzle(client)` from `drizzle-orm/postgres-js`. All access through `db.transaction` inside the identity wrapper. Nested work uses savepoints, which work inside one transaction | rule 11 |
| Credentials | `DATABASE_URL` per Vercel environment (Production → nestly-prod, Preview → nestly-preview), password URL-encoded. Never the owner role's password | `[repo: WORKPLAN 7.4]` |
| Forbidden | `sql.reserve()`, session `SET`, LISTEN, cursors across transactions, `pg_advisory_lock` (use `pg_advisory_xact_lock`) | `[F4]` |

**One thing to watch.** If the Vercel function handles concurrent requests in one instance (Fluid compute)
`[A]`, then `max: 1` serialises them behind one connection. That is acceptable at MVP traffic. Raising it
multiplies pooler clients against the Free limit of 200 `[repo: data-model.md]`. Decide this with numbers,
not now.

---

## (c) The Data API

**Today:** enabled on both projects, exposing `public` and `graphql_public` `[F1]`. Nothing in the repo uses
supabase-js yet `[repo: no match in apps/]`. The web app will use it for sign-in only
`[repo: decisions.md "Supabase"]`, and sign-in goes through Supabase Auth, a separate service at `/auth/v1`.

| Option | Effect | Assessment |
|---|---|---|
| **C1 — turn the Data API off entirely** on both projects | No REST or GraphQL surface at all | Auth is unaffected `[A]` → T7. The Storage decision (M1) and Realtime are separate services too `[A]`. Reversible with a toggle. This is the smallest surface, matching "the only public surface is the server's endpoints" (rule 7) |
| C2 — keep it on, remove `public` from the exposed schemas | `graphql_public` still served | Keeps a surface nobody uses, for no gain |
| C3 — keep it as it is; product schema not `public` | Already required by rule 7 regardless | Not an alternative, it is the second fence. On its own, it leaves `public` with Supabase's default grants to `anon` exposed |

**Recommend C1 plus rule 7 as already decided:** the product schema is not `public` (its name is decided with
the first table), and privileges for `anon` and `authenticated` on it are granted only per policy. Rule 7's
text stays as it is: "off for the product schema" is still true when the API is off entirely.

**When:** now, on both projects, before any table exists. Nothing reads it, so the blast radius is zero, and
switching it off before data exists is always cheaper than after. Afik does it in the dashboard; it is about
two minutes per project.

---

## (d) Tests before the first migration

Agents cannot run these, because `psql` and `curl` are denied. They are run by Afik in the Supabase SQL editor
or a terminal, or by a `workflow_dispatch` probe job. **All of them run on nestly-preview, with throwaway
`probe_*` roles and schemas that are dropped afterwards. Production is not touched.**

| # | Test | How | Answers |
|---|---|---|---|
| T1 | GitHub runner IPv6 | `workflow_dispatch` job, no secrets: `curl -6 https://api64.ipify.org` and `nc -6 -zv db.<ref>.supabase.co 5432` | Needed only if Afik prefers option 4. Not needed for option 1 |
| T2 | Role bootstrap is possible | SQL editor as `postgres`: `CREATE ROLE probe_server LOGIN NOBYPASSRLS`; `GRANT authenticated TO probe_server WITH INHERIT FALSE, SET TRUE`; `CREATE ROLE probe_owner LOGIN NOBYPASSRLS`; grant it `CREATE` on the database, `USAGE` on `auth`, `EXECUTE` on `auth.uid()`, `REFERENCES` on `auth.users` | rule 2 can be built as written (ADMIN OPTION); R1 is possible |
| T3 | Custom role through the pooler | Afik's terminal: connect as `probe_server.<ref>` on 6543 and as `probe_owner.<ref>` on 5432; `select current_user, session_user` | `[F3]`'s open point |
| T4 | Identity transaction on 6543 | As `probe_server`: (i) `select auth.uid()` outside a transaction → must fail (permission denied). (ii) `BEGIN; SET LOCAL ROLE authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true); select current_user, auth.uid(); COMMIT;` → `authenticated`, `<uuid>`. (iii) Afterwards, with several connections cycled: `select current_user, current_setting('request.jwt.claims', true)` → `probe_server`, empty. (iv) The same through postgres-js with `prepare: false` and a bound parameter | rule 3 under the real pooler; fail-closed; no leak |
| T5 | Migration through the session pooler as the owner | `workflow_dispatch` job with a `preview` environment secret: `supabase db push --db-url` of one throwaway migration (create a schema, a table, `ENABLE` + `FORCE ROW LEVEL SECURITY`, a policy using `auth.uid()`, an FK to `auth.users`) as `probe_owner` on 5432 with `verify-full`. Then drop it | Option 1 and R1 work end to end, including the CLI's history table |
| T6 | Required reviewers on a public Free repo | GitHub → Settings → Environments → `production` → Required reviewers is available | condition 2 of option 1 |
| T7 | Data API off and Auth alive | After C1: `GET https://<ref>.supabase.co/rest/v1/` is refused; `GET /auth/v1/health` is OK | C1 is safe |

Order: T2 → T3 → T4 → (C1, T7) → T6 → T5. If T2 fails, stop: that is a blocker on rule 2, for Afik.

---

## Done · Artifact · Findings · Open · Next owner

**Done:** A recommendation for the 7.3 infrastructure decisions: the migration path, the runtime connection, the
Data API, and the tests to run before the first migration.

**Artifact:** `C:\Users\Afik\nestly\.work\infra-7.3\recommendation.md`

**Findings:**
- The PG 17.11 version check in 7.3 is closed. Rule 2 uses `WITH INHERIT FALSE, SET TRUE`.
- New risk: on PG 16+ the `authenticated` grant needs ADMIN OPTION, and whether Supabase's `postgres` has it is
  unverified (T2). If it does not, rule 2 needs redesign.
- New risk: Vercel's `main` deploy and the migration are not ordered. Proposed an expand/contract convention.
- Any CI migration path adds the first secrets to a public repo, so environments plus a trigger ban are required.
- Free has no backups, so a destructive production migration needs a dump first.

**Open:**
- `DECISION REQUEST 1`: migration path. Recommend option 1: CI over the session pooler, $0.
- `DECISION REQUEST 2`: production migrations need Afik's one-click approval in the GitHub `production`
  environment. Recommend yes.
- `DECISION REQUEST 3`: the migration role. Recommend R1, a dedicated `app_owner`, with a fallback to `postgres`
  only for the step T2/T5 shows is impossible.
- `DECISION REQUEST 4`: change rule 5 to the wording in (a), and the "Connections from functions" paragraph.
  This follows DR1/DR3.
- `DECISION REQUEST 5`: the Data API. Recommend C1, off entirely on both projects, now.
- `DECISION REQUEST 6`: run T2–T7 on nestly-preview as listed. Afik runs T2–T4 and T6–T7. T5 needs one
  `preview` environment secret for a throwaway `probe_owner` role.

**Next owner:** Afik (DR 1–6).
