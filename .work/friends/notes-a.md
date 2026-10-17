# notes — F2.4a friendships schema + API

**Approach**        Migration `20261017160000_friendships.sql` exactly as schema.md (friendships, regular_names, transition trigger, name trigger,
                    FORCE lift for the backfill) + guarded down script. Route → service → repository (`routes/friends.ts`,
                    `services/friends-service.ts`, `repositories/friends-repository.ts`), strict Zod in `packages/shared/src/validation/friends.ts`,
                    `FRIENDSHIP_STATUSES`, Drizzle `friendships`, `friendshipsInsert`, `friendshipsUpdate`, `regularNames`. Preview cleanup tool
                    updated (9 → 11 tables, deletes before regular_profiles). Routes are the ones in `apps/server/tests/helpers/friends-api.ts`.
**Decisions**       - The actor (stopped / not Regular) is classified first, in the same transaction, so P/M/D/suspended get 403 whatever the target;
                      403 bodies: `account_unavailable` (stopped), `forbidden` (not Regular, or no account row). `forbidden` is my choice (spec: "403").
                    - Send: reopenDeclined (DR-7) → insert on conflict do nothing → read pair → 409 reason / lift cancel / 404. 23503 → 404, 42501 → 403.
                    - 404 vs 409 per the Gate 1 clarification: only a row in the action's own direction counts (remove: accepted/removed).
                    - A path id that is not a uuid → 400 `invalid` (spec c12), unlike journeys' 404.
                    - Success bodies are `{}` (201 send, 200 actions); `status` is never returned. `sent` list holds pending and uncancelled declined (DR-3 A).
**Deviations**      none from schema.md. Migration adds `comment on` for tables, columns, indexes, policies, functions.
**Deliberately not done**   c24 send counting (F2.4c1); web; knowledge files (data-model*.md — DATA ARCHITECT, same PR); e2e.
**Uncertain**       Status-copy cascade, regular_names INSERT grant, FORCE lift: verified only by the local run (up → down → up, 61 and server db tests).
**Tests**           Hook blocks BUILDER from writing test files. Written through the shell as the task asked (amendments only): `tools/preview-e2e-cleanup.test.mjs`,
                    `supabase/tests/10_identity_structure.sql`, `20_registration_structure.sql`, `53_profile_view.sql` (B's own regular_names row in the scan).
                    NEW `60_friendships_structure.sql` was blocked by the hook; the draft passes (29 tests) and is at
                    `/tmp/claude-0/-home-user-Nestly/6b4ce000-0801-5bba-a927-38d07c670e35/scratchpad/f24a-structure.draft` — copy to `supabase/tests/60_friendships_structure.sql`.
                    `apps/server/tests/drift.test.ts` needs friendships (11 cols) and regular_names (2 cols) added to its catalog list: currently red.
**Preview path**    nothing on screen before F2.4b/c2.
**Neighbouring**    TEST ENGINEER's files, found while running them locally (not edited):
                    - `tests/db/friends.db.test.ts:~527` "A becomes suspended/banned": `fx_fr_state()` hashes whole rows, including the requester/addressee status copies
                      that the cascade must change on suspension; the hash differs by design. Hash only the non-copy columns.
                    - `61_friendships_actions.sql:300` expects 'a>c:accepted' but `fx_fr_rows` always labels 'a>b'; expect 'a>b:accepted'.
                    - `61_friendships_actions.sql:308` `like(text, unknown, text)` does not exist: cast the pattern (`'ERR:%'::text`).
                    - `53_profile_view.sql` last test and `01/02` gate files error locally on PG16 (no MAINTAIN): environment only.
