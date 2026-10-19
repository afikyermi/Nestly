# notes — tools throughput (Afik 19.10 items 2-3)

**Approach**        (2) ci.yml browser matrix shard 1..5, `--shard=N/5`, comment updated; Edge stays 3.
  (3) db-local.mjs: name `nestly-local-db-<8 hex sha256(root)>`, port 54400-54899 from the same hash
  (`checkoutInstance`), 127.0.0.1 only, `down` only this checkout's container; new `pgtap [--keep] [files]`; README updated.
**Decisions**       Root normalised before hashing (separators, trailing slash, lower case on win32).
  `localUrl(user, pw, port)` rejects ports outside the range; `dockerRunArgs` takes name and port.
  pgtap: each file via psql in the container as app_server, PGOPTIONS search_path=pgtap,tests (no pg_prove in the image),
  files = CI's find (all .sql under supabase/tests except setup/, sorted). `tapVerdict` fails on `not ok`, no plan,
  plan/count mismatch, or psql exit != 0. The RLS-gate step before pg_prove is not run (same as `test`).
  Added `?sslmode=disable` to the `supabase db push` URL only: the pinned CLI refused plaintext without it, so the build failed.
**Shard independence**   Verified, none shared: the browser suite is e2e stubs only (e2e/support/*-stub.ts), no DB, no
  Supabase, no test accounts, no globalSetup/storageState/file writes; each leg is its own runner with its own servers.
**Deviations**      none.
**Deliberately not done**   WORKPLAN/decisions/workflow; Edge matrix; RLS-gate steps in pgtap.
**Uncertain**       `test` here: 756 pass, 1 fail (posts.db.test.ts c2, anonymous key gives 201). The worktree has no
  node_modules, so @nestly links come from the main checkout; likely environment, not verified.
**Evidence**        `pgtap`: 42/42 files. `test`: build OK, 756/757. check:budgets ok. eslint ignores tools/*.mjs.
  The old fixed-name container is gone; no other checkout's container was running.
  TEST FILES BLOCKED by the guard hook (BUILDER does not write tests), not worked around; red until applied:
  ci-browser.test.mjs: shards ['1'..'5'] (l.41, title l.88, header l.2), mutations l.109-113 and 127-128 (/5 legs; 6th shard).
  db-local.test.mjs: localUrl 3rd arg port (54322 pin), dockerRunArgs name/port; add tests for checkoutInstance (stable,
  differs per root, range, name format), parseArgs, pgtapFiles, tapVerdict.
**Neighbouring**    README paragraph after the usage list still says the pg_prove suite is not run locally.
