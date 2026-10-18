# PR 69 — CRITIC (opus) findings, round 1 (returned as text; saved verbatim by ORCHESTRATOR)

(The example database URLs are defanged with a space after `://`: the hardened secret scan blocks them, as it should.)

Reviewed one round: **1 medium** (blocks merge), **4 low**. Nothing weakens the env, secret, force-push, main or approval
protections for ordinary agent behaviour; each bypass below needs an unusual input or a deliberately created decoy.
notes.md not read. Read: review.diff against guard.js, .githooks/pre-commit, settings.json, guard-readers.test.js.

```
--- bug ---
severity: medium
file:     tools/branch-delete.mjs:14 (NAME), :246 (rev-parse), :288 (push)
claim:    a `refs/`-prefixed name is checked against one ref and deletes another: a decoy branch lets the tool delete an
          unmerged branch (or a tag) without any merge check
failure:  1) agent creates a decoy (ordinary, non-force push) at a commit already in main:
             git push origin <main-sha>:refs/heads/refs/heads/feat/unmerged
          2) node tools/branch-delete.mjs refs/heads/feat/unmerged
          3) NAME accepts it; PROTECTED strips refs/heads/ → "feat/unmerged" → not stopped
          4) factsOf reads the decoy's tip (refs/remotes/origin/refs/heads/feat/unmerged) → in main → ancestorOfMain = true
          5) `git push origin --delete refs/heads/feat/unmerged` — git takes a dst starting with refs/ as the full ref name →
             deletes the REAL feat/unmerged with its unmerged commits.
          Same route with decoy `refs/tags/v1` deletes the tag v1. main itself is still refused (PROTECTED checks the
          stripped name). Without `refs/` it is safe: `heads/x` is ambiguous on the remote and git refuses it.
fix:      refuse any name starting with `refs/`; always push the full ref with a lease:
          git push origin --force-with-lease=refs/heads/<b>:<tip> --delete refs/heads/<b>
          (the lease also fixes the low at :288). Tests for refs/heads/x and refs/tags/x.
--- end ---
--- bug ---
severity: low
file:     tools/branch-delete.mjs:288
claim:    the delete is not bound to the tip that was approved: commits pushed after the check are lost
failure:  feat/x approved (tip T in main) → before the push a parallel agent pushes commit U → push --delete removes feat/x
          with U. A clone with a narrowed fetch refspec (single-branch/CI checkout) can also keep a stale T, since fetch
          --prune doesn't refresh branches outside its refspec.
fix:      --force-with-lease=refs/heads/<b>:<tip> (as above); read the tip with `git ls-remote origin refs/heads/<b>`
          rather than the local remote-tracking ref.
--- end ---
--- bug ---
severity: low
file:     tools/branch-delete.mjs:260
claim:    the merged-PR lookup does not require the PR's base to be main; a PR merged into another branch counts as
          "merged" (the tool's own header says "merged into main")
failure:  stacked PR feat/b → ready/p4 merged (head = feat/b's tip); `node tools/branch-delete.mjs feat/b ready/p4` deletes
          feat/b (counted merged), then ready/p4 (always allowed) → feat/b's commits on no remote branch (only
          refs/pull/N/head or a local clone).
fix:      add `&base=main` to the query (and/or compare `.base.ref == "main"` in the template).
--- end ---
--- bug ---
severity: low
file:     .claude/hooks/guard.js:452, :460-466
claim:    the DB-URL exemption looks only at the first host / text before the first `@`; a real password — even for a
          Supabase host — passes in a TEST_OR_DOC file
failure:  (i) real host in the query string:
          postgres:// postgres.abc:Zq9realpw@localhost:6543/postgres?host=aws-0-eu-central-1.pooler.supabase.com
          host group stops at `:` → localhost → placeholder; `?host=` sets the actual host.
          (ii) multi-host: postgres:// u:Zq9realpw@localhost:5432,db.abc.supabase.co:5432/postgres → only localhost judged.
          (iii) `@` in the password: postgres:// u:test@Zq9real@prod.rds.amazonaws.com/db → the password group stops at the
          first `@` → "test" (placeholder word); WHATWG URL / pg-connection-string split at the last `@` → test@Zq9real.
          All three passed in docs/x.md; before this PR all three were blocked.
fix:      do not exempt when the URL has a second `@` in userinfo, a `,` after the host, `host=`/`hostaddr=` in the query,
          or `supabase.` anywhere. One test each for (i)–(iii).
--- end ---
--- bug ---
severity: low
file:     .claude/hooks/guard.js:498, :514
claim:    the line's file comes from the `+++ b/` line, but the diff runs without fixed prefixes, so the clone's git config
          decides that line and can make every file look TEST_OR_DOC
failure:  `git config diff.dstPrefix docs/` (git config is neither blocked nor denied) → `+++ docs/apps/server/src/db.ts`
          matches `(^|/)docs/` → this product file commits past the scan (guard and pre-commit, same function):
          const url = 'postgres:// app:anything@localhost/x'
          Separately, a path with a space gets a trailing tab, so `.md$` fails (a false block only, not a bypass).
fix:      pass --src-prefix=a/ --dst-prefix=b/ (and --no-relative) to the :498 diff; strip a trailing \t. Add a test with a
          docs file and a product file in one repo (every 6ג test today uses one file per repo).
--- end ---
```

Probes: (a) secret scan — everything else refused safely: look-alike hosts (`localhost.attacker.com`, `127.0.0.1.nip.io`,
`localhost%2E…`) not placeholders (host regex anchored); IPv6 only `[::1]` exempt; `db:5432` exempt as `db` (by design);
deleted/binary files have no `+` lines; renames keep `+++ b/new`; quoted paths stripped; `diff --git` resets the file and a
`+` line cannot open a new file — no carry-over; .githooks/pre-commit calls the same scanForSecrets; the new regex matches
everything the old one did. (b) branch-delete — unicode, `:`, `+`, leading `--` refused by NAME/argv; main via a ready/ name
impossible; origin/main refreshed by the fetch (fetch failure throws before any delete); fork PRs excluded by
`head=owner:branch`; the guard not seeing the tool's child push is acceptable — no new hole (any agent-written script could
already push --delete; tools/ is not "ask" in settings.json, so a refused agent could even edit the tool). (c) the raw-delete
message still returns critical(...); force push pinned r4-critical in guard-readers.test.js:365-374. (d) no existing guard
test changed or removed; guard.js:120 changes only a comment — the jq rule is identical.

Open: pre-existing gaps to log in security-privacy-open.md, not here — the scan misses uppercase `POSTGRES://`,
`postgresql+asyncpg://`, an empty user `postgres:// :pw@`, and `?password=`. `PLACEHOLDER_WORD` exempts `password\d*` /
`pass\d*` on any non-Supabase host in tests/docs, so a real weak password like `pass2024` passes — per the spec as written;
narrowing is Afik's call. Server-side protection for main is unconfirmed (could not check GitHub branch protection) — the
only real backstop behind the guard. Next owner: BUILDER (medium), then CRITIC re-checks the medium only.

## ORCHESTRATOR (18.10.2026)
- Medium: names starting with refs/, heads/, tags/ or remotes/ refused before any lookup; the delete pushes
  `:refs/heads/<b>` with `--force-with-lease=refs/heads/<b>:<tip>` (deleteArgs, tested).
- Low #2: tip read with `git ls-remote origin refs/heads/<b>` (exact name match) + the lease.
- Low #3: query `&base=main`, template keeps only `.base.ref == "main"`.
- Low #4: a URL is a placeholder only with one `@`, no host list, no host=/hostaddr=, no "supabase." anywhere; tests (i)–(iii)
  plus hostaddr and pass2024. Open item: `password\d*`/`pass\d*` removed from the placeholder words (narrowed).
- Low #5: diff with --src-prefix=a/ --dst-prefix=b/ --no-relative; tab stripped; test with diff.dstPrefix/noprefix and a doc +
  product file in one repo.
- Pre-existing gaps → security-privacy-open.md S-64; the tool route → S-65. main deletion IS blocked server-side: the
  "main protection" ruleset (18.10) has the `deletion` rule.
