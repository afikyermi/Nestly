# notes — F2.4c1 viewer API, Friend branch, profile-open limit

**Approach**        Migration `20261017170000_profile_open_limit.sql` as schema.md (3 tables, 7 `TO app_owner` policies, `profile_view` dropped and
                    recreated with the four trailing columns, `is_full` widened to Friends, count + Security event inside it) + guarded down
                    (`supabase/rollback/20261017170000_profile_open_limit.down.sql`, recreates 150000's text verbatim, deletes only its own history row).
                    Server: `GET /api/profiles/:userId` (`routes/profile-view.ts` → `services/profile-view-service.ts` → `repositories/profile-view-repository.ts`),
                    `lib/profile-open-limit.ts` (RateLimited, NS001 mapping), `routes/rate-limit-reply.ts` (the one 429 body). F2.4a's send calls `countOpen`
                    first (c24). Shared: constants (`SECURITY_LIMIT_KEYS`, `SECURITY_EVENT_KINDS`, `RELATIONSHIP_STATES`, `PROFILE_VIEW_OUTCOMES`),
                    `validation/profile-view.ts` (strict `profileViewRow`, `profileViewResponse`, list entries). Drizzle: 3 tables, drift only.
                    Cleanup tool: 11 → 14 tables, `profile_open_counts` and `security_events` deletes after `regular_profiles`, before `identity_link_checks`; none for `security_limits`.
**Decisions**       - `limited` returns normally from the transaction (COMMIT, the event persists); NS001 is thrown by the database (rollback) and mapped to the
                      same 429 with `misconfigured: true`, which the route logs once (`sqlstate NS001`, no id). Same in the send.
                    - The viewer is classified first (`readOwnAccounts`): stopped → 403 `account_unavailable`; no account row → 403 `forbidden`; any active type
                      (P, M, D) may view, as profile_view allows. Own id is not special-cased on the server (DR-O A is a web rule).
                    - The 200 body is camelCase: `fullName, gender, childrenCount, childAges [{years, months}] | null, isPregnant, showsEmptyJourneySentence,
                      relationship | null, friends[], mutualFriends[]`. `gender`/`childAges` null = Restricted to this viewer. No `outcome` in the body.
                    - 429 body `{error:'rate_limited'}`, no Retry-After, no numbers. 404 `{error:'unavailable'}`, 400 `{error:'invalid'}` (non-uuid, before any query).
                    - Route is `/api/profiles/:userId`; any other method 405 `Allow: GET`.
**Deviations**      - SQL: `bool_or` written `pg_catalog.bool_or`; otherwise schema.md's body, laid out for reading. The versions: 170000 (Amendment).
                    - The jsonb columns arrive as parsed objects from postgres-js (checked), so the row schema has no JSON text fallback.
**Deliberately not done**   knowledge files (`data-model*.md`: DATA ARCHITECT); web; no Admin/Security-event reader; the old F2.3b text stays only in the down script.
**Uncertain**       - Ran on PG16 only. Concurrency of 120 opens (c20) is by construction (own-row lock via `insert … on conflict do update`), not run by me: TEST ENGINEER's `tests/db/` case is its first run.
                    - `friends`/`mutual_friends` lists are unbounded and the policy `regular_names_select_profile_view` runs a correlated EXISTS per name; fine at today's scale, flagged for DATA ARCHITECT if a Friends list grows large.
**Checks run**      migration up → down → up OK (fingerprint restored; `localdb.sh`, history row of 170000 only); drift none (156 columns / 14 tables); typecheck, lint, check:budgets,
                    check:stories green; server unit 719/719, shared 325/325, `tools/preview-e2e-cleanup.test.mjs` 88/88; `tests/db/friends.db.test.ts` 70/70 with the limit raised to 10000
                    (see below). By hand in a rolled-back transaction as `authenticated`: Restricted B → no gender/ages; accept → Friend view with B's Open fields; lists exact `{userId, fullName}`,
                    mutual list; none/sent/received/friends; 101st open → `limited`, repeated stays `limited`; limit row deleted → NS001 → `{rate_limited, misconfigured}`; direct SELECT on the counter → denied.
**Tests (TEST ENGINEER's — not touched by me)**
                    NEW   `supabase/tests/63_profile_view_friend.sql`, `64_profile_open_limit.sql`, `supabase/tests/setup/61_open_limit_fixtures.sql` (schema.md "pgTAP").
                    NEW   viewer route unit test (`apps/server/tests/profile-view-route.test.ts`: 400/401/403/404/429/200, strict body, no number, 405) and a `tests/db/` case
                          (120 concurrent opens → ≤ 100 × 200; a committed refusal keeps its event; c24 send at the limit → 429, no row).
                    AMEND `supabase/tests/53_profile_view.sql`: tests 4-5, 9, 16, 33-34, 38-39, 42-43, 45-46, 48, 50, 52, 56, 58-61, 63, 65, 120-121 compare whole rows and now see the four
                          new columns (`relationship` is 'none' for a Regular viewer, NULL for P; `friends`/`mutual_friends` `[]`; `outcome` 'shown'); tests 167-168: the profile_view policy list is now 8, not 4 (the 4 original + the 7 new policies, minus any the filter excludes: the run said have 8 for the 167 filter, want 4).
                    AMEND `supabase/tests/60_friendships_structure.sql` #11: "exactly five policies" → seven (+ `friendships_select_profile_view`, `regular_names_select_profile_view`).
                    AMEND `supabase/tests/20_registration_structure.sql` tests 20-21 (table counts 11 → 14).
                    AMEND `apps/server/tests/db/friends.db.test.ts`: the same fixture accounts send > 100 times across the file, and c24 now counts each send, so from about the 100th send
                          every send is 429 (31 failures on a fresh DB). It needs the counter reset between tests (a postgres-owned fixture, `fx_open_count`/`fx_age_opens`/`fx_set_limit`).
                    AMEND `apps/server/tests/friends-route.test.ts`: add the send's 429 `rate_limited` (outcome mocked) and NS001 logging case.
                    Already amended in the tree and green: `tools/preview-e2e-cleanup.test.mjs`, `apps/server/tests/drift.test.ts`. 01/02 gate files fail locally on PG16 only (no MAINTAIN).
**Preview path**    nothing on screen (no web in c1). API only: with a signed-in session, `GET /api/profiles/<another Regular's id>` → 200 body; a random uuid → 404; 101 calls in an hour → 429.
**Neighbouring**    none new. (F2.4a notes' TE-file defects in `61_friendships_actions.sql` / `friends.db.test.ts` hashing are unchanged by this part.)
