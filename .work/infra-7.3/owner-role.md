# owner-role — 7.3: two platform limits on `app_owner` (R1)

**Author:** DATA ARCHITECT · 11.10.2026 · **Status:** recommendation. Decision owner: ORCHESTRATOR (see (4)).
No migration is written here.

**Tags:** `[V]` = verified: the T2–T5 results in the task brief, 11.10.2026, nestly-preview, PG 17.11 ·
`[repo]` = read in this repo · `[PG]` = standard PostgreSQL behaviour, from the documentation and source as I
know them, not re-run today · `[A]` = assumption. Every `[A]` and `[PG]` that the recommendation rests on has a
probe in (5), runnable by an agent on nestly-preview through `tools/db-preview.mjs`.

---

## The two limits, restated

- `postgres` holds USAGE on schema `auth` and REFERENCES on `auth.users`, but without grant option, so any grant
  of them to another role grants nothing `[V]`.
- **L1** — `app_owner` cannot create an FK to `auth.users` `[V]`.
- **L2** — `app_owner` cannot create anything whose definition names `auth.uid()`: a policy `[V]`, and by the same
  name-lookup rule a column default (rule 12) and a function body `[PG]`.
- **L2 has a third, runtime case** the probe did not exercise. Rules 10 and 16 make SECURITY DEFINER functions
  that call `auth.uid()`. If `app_owner` owns them, as it owns every product object, their body runs with
  `app_owner`'s rights, so `app_owner` needs USAGE on `auth` **at runtime**, not only when the migration runs
  `[PG]`. Any fix for L2 has to cover this case too.

---

## (1) L2 — how `app_owner` reaches `auth.uid()`

| # | Option | Security | Cost / drift | Verdict |
|---|---|---|---|---|
| **A** | `grant authenticated to app_owner with inherit true, set false` | See the analysis below. In short: `app_owner` gains exactly the privileges `authenticated` holds. That is a subset of what `app_server` already reaches by design (it can `SET LOCAL ROLE authenticated` and set any claims, rule 3). FORCE RLS (rule 8) is unchanged | Verified end to end: CLI push, ownership, FORCE, a policy with `auth.uid()`, and the history table `[V]`. Rules 3, 12, 15 and 16 keep their wording: `auth.uid()` everywhere | **Recommend** |
| B | A product-schema `uid()` (SECURITY INVOKER, `STABLE`) returning `nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid`; policies call it instead of `auth.uid()` | Equal to A in itself: it reads a GUC that the server sets transaction-locally, and needs no schema `auth`. `app_owner` stays outside `authenticated` | Two definitions of "the current user". Product policies would use ours, while Supabase-managed schemas (Storage policies, `realtime.messages`) keep `auth.uid()`. Today they agree. If Supabase changes how `auth.uid()` reads its claims (it has changed this once already, adding `request.jwt.claims` beside the older `request.jwt.claim.sub` `[A]`), they diverge silently. Rules 3, 12, 15 and 16 would need rewording, and Supabase's RLS advisor lints would stop recognising our policies `[A]`. Not probed | Rejected. It is viable, but it trades a verified path for a second identity contract |
| C | Grant `anon` rather than `authenticated` (also holds USAGE on `auth` `[A]`) | Narrower: policies `TO authenticated` in other schemas would not apply to `app_owner` | Unprobed: we do not know whether `postgres` holds ADMIN OPTION on `anon` `[A]`. Its gain is small, because `app_server` holds both roles anyway (rule 2) | Rejected for now. Reconsider only if (4)'s re-check trigger fires |
| D | `postgres` creates every policy, default and definer function | — | Puts `postgres` in every migration that has a policy, which is nearly all of them. That reverses R1. It also does not fix the runtime case | Rejected |

### What `app_owner` inherits under A, and whether that weakens anything

1. **Inside the product schema: nothing new.** `app_owner` owns those objects. It could already drop policies or
   run `NO FORCE` `[PG]`. Rule 1 still bars it from runtime, and rule 5 confines it to CI.
2. **The privileges `authenticated` holds elsewhere.**
   - USAGE on `auth` and EXECUTE on `auth.uid()`, `auth.role()` and `auth.jwt()` `[V, partly]`.
   - Supabase's grants on `public`, `graphql_public`, `storage` and `realtime` `[A]`.
   - Membership in `authenticated` does **not** include SELECT on `auth.users` `[A]` → probe P1.
3. **Policies `TO authenticated` now apply to `app_owner`.** PG decides whether a policy applies with
   `has_privs_of_role`, and an INHERIT TRUE grant satisfies it `[PG]` → probe P3.
   - Today: with no claims set, `auth.uid()` is null, so `owner = auth.uid()` policies give `app_owner` no rows.
   - The real gain: anyone holding `app_owner`'s password can set `request.jwt.claims` to any uid and act as that
     user under `TO authenticated` policies in **non-product** schemas, Storage above all.
   - The same capability is held by `app_server` by design. So a leaked CI secret reaches no more than a leaked
     Vercel secret already does.
   - The stated reason for R1 was "a leaked CI secret reaches the product schema, not auth, storage or the
     Supabase internals" `[repo: recommendation.md]`. After A:
     - `auth` tables: still unreachable (P1).
     - The Supabase internals: still unreachable.
     - Storage: reachable as any user. Storage is unused today, and M1 (the storage provider) is undecided
       `[repo: decisions.md "Pending"]`.
4. **SET FALSE matters.** `app_owner` cannot become `authenticated`. Under PG 16+ it also cannot transfer an
   object's ownership to `authenticated` `[PG]`.
5. **Objects owned by `authenticated`** would become `app_owner`'s to alter. Expected count: zero `[A]` → probe P1.
6. **A side effect that is good.** Definer functions owned by `app_owner` can call `auth.uid()` at runtime.

**A consequence to carry into the first definer function.** This is not caused by A, but A shapes it.

- Rule 8 (FORCE) applies to the owner. So a SECURITY DEFINER function owned by `app_owner` (rules 16 and 17) is
  itself held to RLS when it reads product tables.
- Under A, the `TO authenticated` policies apply to it, both permissive and **restrictive** (for example a
  rule 15 gate). Because the caller's claims are still set inside the function, it would see what the caller
  sees, which defeats its purpose.
- This tension between rules 8 and 16/17 exists with or without A. It must be resolved at the Gate 2 of the first
  feature that has a definer function. The likely shapes are a named `TO app_owner` policy per table, listed as an
  approved exception, or a separate non-owning role for definer functions. Not decided here.

---

## (2) L1 — the FK to `auth.users`

| # | Option | Integrity / deletion | Cost | Verdict |
|---|---|---|---|---|
| **E** | **One anchor table references `auth.users`.** `postgres` adds that single FK in a bootstrap step. Every other product table references the anchor, never `auth.users` | Database-enforced. Deleting the Auth user cascades into the anchor, and from there through each relation's own ON DELETE | One bootstrap statement per environment, **once**, not per table | **Recommend** |
| F | No FK. A trigger on `auth.users` (AFTER DELETE) removes the anchor row | Equivalent outcome | Needs a trigger on a table we do not own, plus a SECURITY DEFINER function. That is a rule 10 exception, harder to review than an FK, and it is still a `postgres` bootstrap step `[A: postgres holds TRIGGER on auth.users]` | Rejected |
| G | No FK. The server deletes product rows, then calls the Auth admin API | Not atomic: a failure between the two calls leaves an Auth user without data, or data without a user (orphan personal data, a privacy and retention defect). It also needs the service-role key on the server, against rule 1's spirit | — | Rejected |
| H | No FK. A periodic `app_jobs` reconciler deletes orphans | Orphans persist until the job runs, and it needs a cross-user `TO app_jobs` policy | — | Rejected |

### How `postgres` adds a constraint to a table owned by `app_owner` `[PG]` → probe P2

- `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` requires two things of the **current user**:
  - **ownership** of the referencing table, which a member of the owner role with INHERIT satisfies;
  - **REFERENCES** on the referenced columns.

  The RI triggers created on `auth.users` are internal and need no separate privilege.
- So, run once as `postgres`:
  1. `grant app_owner to postgres with inherit true, set false;`
     - On PG 16+, the role that creates `app_owner` holds ADMIN OPTION on it, so `postgres` can grant itself
       membership `[PG; A on Supabase]`.
     - This is admin-side only: `postgres` can reach `app_owner`, never the reverse. It is reversible with
       `revoke`.
  2. `alter table <schema>.<anchor> add constraint <anchor>_id_fkey foreign key (id) references auth.users (id) on delete <action>;`
     - Run it as `postgres` itself, **not** after `set role app_owner`, because `app_owner` lacks REFERENCES.
     - The table stays owned by `app_owner`.
- Rejected mechanism: temporarily changing the table's owner to `postgres` and back. It leaves a window, and on
  PG 16+ it needs SET on `app_owner`.

### At runtime `[PG]`

- RI queries run as the owner of the table they touch, with RLS not forced (`SECURITY_NOFORCE_RLS`).
- **Insert into the anchor:** the check reads `auth.users` as its owner, so it works.
- **Deleting an Auth user:** the cascade deletes from the anchor as `app_owner` with RLS bypassed for that
  internal query, so FORCE does not block it. Audit triggers (rule 18) still fire.
- `app_owner` needs no rights on `auth.users` at runtime.

### How account deletion cascades

- The FK is the mechanism. The ON DELETE action of the anchor and of each relation is **not decided here**.
- Retention (§13.4) is open, and it touches data about minors (Child, JourneyContext), which is reserved item 4.
- Whether the anchor's FK is `cascade` or `restrict` (deletion through a grace-period flow) is decided at the
  first table's Gate 2. It becomes a `DECISION REQUEST` if §13.4 is still open then.

### Ordering and risks of the bootstrap step

- The CI migration creates the anchor without the FK. The bootstrap then adds it.
- The feature code that writes the anchor merges only after the bootstrap has run in that environment
  (expand → deploy). On an empty table, the FK validates instantly.
- **Production:** the bootstrap is a direct SQL path to nestly-prod. Under reserved item 2, Afik runs it himself
  in the SQL editor. That is the fallback already approved in R1 ("postgres for that step only").
- The script is versioned in the repo and idempotent: it checks `pg_constraint` before adding.
- **Drift risk:** `app_owner`, as owner, can `DROP CONSTRAINT` it in a later migration `[PG]`, and only
  `postgres` can restore it. Add a pgTAP check that the FK exists. CRITIC flags any migration that touches it.
- **Local and test databases** (`supabase start`, pgTAP in CI) must run the same bootstrap `[A: the local stack
  applies migrations as a superuser, so ownership differs locally]`. BUILDER handles this with the first table.

---

## (3) Wording for `.claude/knowledge/data-model.md`

Applied only after ORCHESTRATOR decides, and after probes P1–P3 pass. Rules are not renumbered.

**Rule 5:** append after "…on the GitHub `production` environment.":

> `app_owner` holds `authenticated` `WITH INHERIT TRUE, SET FALSE` and nothing else outside the product schema:
> on Supabase, `postgres` holds USAGE on schema `auth` without grant option, so this membership is the only way
> `app_owner` can create policies, defaults and functions that call `auth.uid()`, and run them inside its own
> SECURITY DEFINER functions (T5, 11.10.2026). It never runs at runtime (rule 1).

**New paragraph after "Connections from functions":**

> **The `auth.users` anchor and bootstrap steps.** Exactly one product table references `auth.users` (the
> anchor, named with the first table). Every other table references the anchor, never `auth.users`. `app_owner`
> cannot hold REFERENCES on `auth.users` (`postgres` lacks grant option, T5, 11.10.2026), so that one FK is added
> by `postgres`, a member of `app_owner` (`WITH INHERIT TRUE, SET FALSE`), in a versioned, idempotent bootstrap
> script run once per environment. On nestly-prod, Afik runs it. A pgTAP test asserts the FK exists. Bootstrap
> steps, the complete list (anything else needing `postgres` is a `DECISION REQUEST`):
> 1. create `app_owner`, `app_server` and `app_jobs` and their grants, and `grant app_owner to postgres`;
> 2. the anchor's FK to `auth.users`;
> 3. extensions and pg_cron jobs, when needed.

**Note under rules 16 and 17** (until resolved at the first definer function's Gate 2):

> Open: FORCE RLS (rule 8) holds a SECURITY DEFINER function owned by `app_owner` to the table's policies,
> including those `TO authenticated` (which `app_owner` inherits). How definer functions reach the rows they
> exist for is decided with the first one.

---

## (4) Does either change the security model?

**No, in my judgement, so this is ORCHESTRATOR's decision.**

- The runtime model is unchanged:
  - RLS is the only enforcement point.
  - `app_server` acts through `SET LOCAL ROLE`.
  - No role bypasses RLS.
  - FORCE RLS applies to every table.
  - `app_owner` is never used at runtime.
- No row becomes readable by anyone who could not read it before.
- E adds integrity; it removes nothing.

**What ORCHESTRATOR must record, because it amends an approved reason.**

- A changes the stated rationale for R1. A leaked CI secret now reaches non-product schemas exactly as far as an
  authenticated user with chosen claims can, the same as a leaked `app_server` secret. Before, it reached "the
  product schema only".
- Today this delta is nil in practice: Storage and Realtime are unused, and `auth.users` stays unreachable (P1).
- Record it in `decisions.md` with a **re-check trigger**:
  - when M1 selects Supabase Storage, or Realtime is adopted, DATA ARCHITECT re-evaluates option C (`anon`) or a
    narrower path;
  - if that path would leave `app_owner` able to impersonate users over stored media (which may include images of
    minors), it goes to Afik (reserved item 4).

**What Afik does, without deciding anything:**

- He runs the L1 bootstrap on nestly-prod himself. That is reserved item 2 by nature.
- That this step falls back to `postgres` was already approved in R1.

---

## (5) Probes before adopting (nestly-preview, throwaway `probe_*` roles, all reversible)

| # | Check | Expect |
|---|---|---|
| P1 | With `probe_owner` granted `authenticated` (INHERIT TRUE, SET FALSE): `has_table_privilege('probe_owner','auth.users','select')`; objects owned by `authenticated` in `pg_class`, `pg_proc` and `pg_namespace`; and a list of `authenticated`'s table privileges outside `auth` | false · 0 · the list recorded in `notes.md` |
| P2 | `grant probe_owner to postgres with inherit true, set false`; `probe_owner` creates a table through the CLI; `postgres` adds an FK to `auth.users(id)`; `probe_owner` then runs `alter table … add column` | the grant is accepted · the FK is created · the owner is still `probe_owner` · the later DDL works |
| P3 | On a FORCE table owned by `probe_owner` with a permissive policy `TO authenticated using (owner = auth.uid())`: as `probe_owner`, select with no claims, then with claims set to a row's owner | 0 rows, then that row. This confirms that `TO authenticated` policies bind `app_owner` |
| P4 | A SECURITY DEFINER function owned by `probe_owner` returning `auth.uid()`, called by `probe_server` inside the identity transaction | returns the caller's uid |

Not probed, because it is standard PG and destructive to stage: the cascade when an `auth.users` row is deleted.
It is covered by a pgTAP test locally once the anchor exists.

**Side fact to carry, from the pooler password cache `[V]`:** after a password rotation, the pooler needs about
20 seconds before it accepts the new password. A CI migration started immediately after a rotation can fail to
authenticate. This affects rotation runbooks, not design.

---

**Done:** recommended A (`authenticated` INHERIT TRUE, SET FALSE) for L2 and E (a single anchor FK added by
`postgres` through membership in `app_owner`) for L1, with the exact `data-model.md` wording and four probes.

**Artifact:** `C:\Users\Afik\nestly\.work\infra-7.3\owner-role.md`

**Findings:**
- L2 has a runtime case: definer functions owned by `app_owner` call `auth.uid()`. Option A covers it; a
  creation-time-only fix would not.
- Rules 8 and 16/17 are in tension: a definer function owned by the FORCE-RLS table owner is itself held to the
  policies. It must be resolved at the first definer function's Gate 2.
- Option A amends the stated rationale for R1 (the blast radius of the CI secret). It needs a re-check trigger
  at M1 and at Realtime.
- A backfill run inside a migration as `app_owner` on a FORCE table is filtered by the policies. The first
  backfill needs a pattern (for example NO FORCE and FORCE inside one migration transaction). Not decided here.
- The pooler password cache affects rotation timing.

**Open:**
- `DECISION REQUEST` (ORCHESTRATOR): adopt A and E and the wording in (3), conditional on P1–P3 passing.
- `QUESTION` (ORCHESTRATOR), default "yes": run P1–P4 on nestly-preview before deciding.
- Deferred to the first table's Gate 2: the anchor's ON DELETE action, possibly a reserved `DECISION REQUEST`
  (§13.4 retention, minors).

**Next owner:** ORCHESTRATOR.
