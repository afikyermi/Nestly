# PR 69 — CRITIC (opus) re-check of the medium (against 7aea692)

Returned as text; saved verbatim by ORCHESTRATOR. notes.md not read; read only tools/branch-delete.mjs,
tools/branch-delete.test.mjs and .work/guard-retro/findings.md at 7aea692.

**The PR 69 medium (a `refs/`-prefixed name plus a decoy deletes an unmerged branch or a tag): fixed, no new problem.**

1. REF_LIKE refusal (branch-delete.mjs:15, used at :19, :30, :52): `/^(refs|heads|tags|remotes)\//i` refuses every attack form
   before any lookup, any case, applied in `decide`, `deleteArgs` and `factsOf` — the push builder is unreachable with a
   ref-like name even if a later caller skips `decide`. Tests (test:38-40) cover refs/heads/…, refs/tags/v1, heads/, tags/,
   remotes/, REFS/ upper case. A partial/unqualified form can no longer reach the push (it always sends a full name).
2. The delete with a lease (deleteArgs, :29-33): `push origin --force-with-lease=refs/heads/<b>:<tip> :refs/heads/<b>`. Git
   honours a lease on a delete: locally it attaches the expected tip to every ref in the push, delete or not, and checks it
   before the forced update — a delete whose remote ref no longer equals `<tip>` is rejected as "stale"; on the server the
   push sends the old value and the delete applies only while the ref holds it. A commit pushed after the check makes the
   delete fail, not be lost. The full refs/heads/… target cannot be read as a tag or a partial name; options after the remote
   are fine; the tip is re-checked as 40 hex. Tested (test:44-46).
3. `ls-remote` exact-name match (:54-56): git matches an ls-remote pattern against the end of each ref name, so a decoy
   `refs/heads/a/refs/heads/feat/x` also matches `refs/heads/feat/x`. Handled twice: the regex has no `m` flag (anchors span
   the whole output → two or more lines never match → refused), and with one line `tip[2] !== branch` refuses any ref other
   than refs/heads/<branch>. Both refuse. Side effect: a decoy can stop a real branch from being deleted until removed — it
   only blocks a delete, never causes one; not a finding.
4. Any other name form aiming the delete elsewhere: none found. NAME allows only [A-Za-z0-9._/-] (no `:`, `+`, `@`, `^`,
   `~`); `..`, `//`, trailing `/`, `.lock`, leading `-` refused; main/master/HEAD refused in any case. A leading slash builds
   `refs/heads//x` — no such ref, ls-remote finds nothing → refused. Decoys `refs/heads/refs/heads/<b>` or
   `refs/tags/refs/heads/<b>` matching the target: with the real branch present git stops with "matches more than one"
   (nothing deleted); without it ls-remote already refused; in the race (real branch deleted between check and push) the
   lease applies to the decoy too — rejected unless the decoy is already at the approved tip (already in main): nothing lost.

Lows: only low #2 (tip read + lease) checked, as it shares this code — no defect. #3, #4, #5 not re-checked.

Done: medium closed, no bugs. Open: none (optionally record the delete-blocking decoy of point 3 as an accepted note).
Next owner: ORCHESTRATOR.
