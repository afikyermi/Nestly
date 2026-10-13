# Findings — guard-allowlist, round 1 (CRITIC on opus, 13.10.2026)

*Saved by ORCHESTRATOR verbatim from CRITIC's return: the harness rejected the subagent's own write of this file.*

```
verdict: Not Ready

Review: CRITIC (cold), bug-fix path step 5, Elevated. Branch claude/guard-allowlist-implementation-xcv55m (PR 6), diff `git diff main...HEAD -- . ':(exclude).work/*/notes.md'`, against .work/guard-allowlist/bug.md (+ Addendum 13.10) and decisions.md 2026-10-12. notes.md not read.
Method: guard.js through force-platform.js against a throwaway mktemp root (notes file and apps/web/src/a.ts holding "SECRET"), forced linux, win32, darwin; each bypass then run with bash in that root printed "SECRET". The real project was never the root. 83/83 guard tests pass.

1. Class closed? No — five unlisted forms reach notes.md (CRITIC) and app source (TEST ENGINEER) on all three platforms, directly and via `all` + agent_type (findings 1–4).
2. Allowlist? Only for git content reads and wildcards. Every other command is allowed by default — a denylist that fails open.
3. Over-blocking: bash -c/eval, ~, <(, ln, cp/mv naming .work, wildcards matching .. — in proportion. Two classes hit everyday commands with a wrong reason (findings 5–6). Blocking # comments is within the accepted cost.
4. No regression in `all` or `builder`; 34 odd inputs produced no "guard error".
5. Tests cover A–F on three platforms, no case for the bypass class, short of F.14/F.15 (finding 7).

--- finding ---
severity: high
file:     .claude/hooks/guard.js:887-947
claim:    Outside git, any command is allowed by default. An interpreter running inline code is a form the allowlist does not know, and it reaches both protected files.
failure:  CRITIC (also all + agent_type critic), linux/win32/darwin, exit 0, prints notes:
          node -e "console.log(require('fs').readFileSync('.wo'+'rk/f/no'+'tes.md','utf8'))"
          python3 -c "print(open('.wo'+'rk/f/no'+'tes.md').read())"
          awk 'BEGIN{while((getline l < (".wo" "rk/f/no" "tes.md"))>0) print l}'
          TEST ENGINEER, exit 0: the same with 'apps/web/sr'+'c/a.ts'.
fix:      Make the command name the allowlist key for the reader roles: a fixed set of readers and runners (cat/head/tail/sed -n/wc/ls/diff, find without exec, npm/npx test and ci, node --test <files>, gh, git under its own rules). Block inline-code flags (node -e/-p/--eval, python -c, perl -e/-n/-p, ruby -e, awk getline/BEGIN reads, deno eval, bun -e). Any command not on the list is blocked with a message naming the list.
--- end ---

--- finding ---
severity: high
file:     .claude/hooks/guard.js:221,466-468
claim:    Nested-shell and recursive-search detection are still lists of spellings (bash/sh nested only when the next token is exactly "-c"; grep recursive only with -r/-R/--recursive).
failure:  All platforms, exit 0, file printed:
          CRITIC: grep -d recurse '' .work/f ; grep --directories=recurse '' .work
          CRITIC: bash -lc 'cat .wo""rk/f/no""tes.md' ; sh -ec '…' ; bash --norc -c '…'
          TEST ENGINEER: grep -d recurse '' apps/web ; bash -lc 'cat apps/web/s""rc/a.ts'
fix:      Any sh-family call with an option cluster containing c, or -c after other options, is nested. -d recurse, -drecurse, --directories[=]recurse are recursive. Better, with finding 1: allow grep only in a known non-recursive form.
--- end ---

--- finding ---
severity: high
file:     .claude/hooks/guard.js:771,802-806
claim:    The content-free git list accepts any option; git fetch --upload-pack=<cmd> runs an arbitrary shell command.
failure:  CRITIC, all platforms, exit 0: git fetch --upload-pack='cat .wo""rk/f/no""tes.md >&2; false' .  — stderr began "SECRET". TEST ENGINEER equivalent also allowed. push --receive-pack/--exec and ext:: remotes are the same family.
fix:      A fixed option list per content-free subcommand. At minimum block --upload-pack, --receive-pack, --exec, -u <cmd> on fetch/pull/clone/ls-remote/push, and ext::/fd:: remotes.
--- end ---

--- finding ---
severity: medium
file:     .claude/hooks/guard.js:76-82
claim:    TEST ENGINEER's app-implementation check ignores case only on win32; darwin's default APFS ignores case.
failure:  Forced darwin, test-engineer, exit 0: cat APPS/web/src/a.ts ; cat apps/web/SRC/a.ts. Read and Grep share isAppImpl/reachesAppImpl. Likely predates the diff, but in the class, and F.15 makes darwin supported.
fix:      Match APP_IMPL, reachesAppImpl and the TEST ENGINEER cd and string checks case-insensitively on all platforms; add upper-case darwin cases.
--- end ---

--- finding ---
severity: low
file:     .claude/hooks/guard.js:788-807
claim:    parseGitArgs reads redirection tokens and --stat=<n> as bad revisions/options, so a content-free diff goes to the content rule with a wrong reason.
failure:  CRITIC: git diff --stat main...HEAD 2>&1 ; git diff --name-only main...HEAD > /tmp/x.txt ; git diff --stat=200 main...HEAD — all blocked "must exclude notes.md". TEST ENGINEER the same with "does not read the implementation through git".
fix:      Drop redirection tokens (and the target after a bare > or 2>) before parsing, as pathArgs does; accept --stat=<n>[,<m>].
--- end ---

--- finding ---
severity: low
file:     .claude/hooks/guard.js:829-831
claim:    The global-option and GIT_ ban runs before the content-free check and matches /GIT_/i as a substring anywhere.
failure:  Both roles blocked on: git --no-pager log --oneline -5 ; git -C <root> status ; git commit -m 'tests: digit_input boundary' ; git add apps/web/tests/digit_input.test.ts ; git commit -m 'review: legit_flag naming'. C.7 and Addendum 3 scope the ban to content reads.
fix:      Check content-free first; apply the ban only to the rest; match \bGIT_[A-Z_]+ case-sensitively and outside commit-message values.
--- end ---

--- finding ---
severity: low
file:     .claude/hooks/guard-allowlist.test.js:375-410
claim:    The tests fall short of F.14 and F.15, and none probes beyond the listed spellings.
failure:  F.14 runs only "a sample"; guard.test.js is not run under forced platforms; the four removed allow cases are not named in the commit message or PR body; no test covers interpreters, shell flag clusters, grep -d, or content-free git options that run commands.
fix:      Run guard.test.js through the force-platform preload; name the changed cases in the PR body; add a block case for each form in findings 1–4.
--- end ---
```

# Findings — round 2 re-check (CRITIC on opus, 13.10.2026)

*Saved by ORCHESTRATOR verbatim from CRITIC's return.*

```
verdict: Not Ready

Re-check at 4fa31f8, diff `git diff 2a5b0fe..HEAD -- . ':(exclude).work/*/notes.md'`, against bug.md + Addendum 2 + G.20. Same probe method (throwaway root, forced linux/win32/darwin). 107/107 guard tests pass.

1. closed — node -e, python3 -c, awk getline blocked ×3 platforms, both roles, direct and via all + agent_type; unlisted commands fail closed (tee, command, exec, time, !, {, if, functions, a program path). Class still open through a listed command: finding 8.
2. closed — bash -lc, sh -ec, bash --norc -c, grep -d recurse, --directories=recurse, --dir=recurse, `--directories recurse` after operands, grep -iR / -e x -r.
3. closed — --upload-pack (and --upload-pac), fetch -u, push --exec, remote add x ext::sh, ext:: fetch blocked; push -u (set-upstream), -C <dir> status, --no-pager allowed.
4. closed — darwin APPS/…, …/SRC/… blocked for test-engineer; cd, wildcard and Glob forms covered.
5. closed — --stat … 2>&1, --name-only … > file, --stat=200 allowed for both roles.
6. closed — --no-pager log, -C <root> status, digit_input / legit_flag text allowed; -c, --git-dir, --exec-path, GIT_DIR= prefix, -C .work log -p, GIT_ word in a content read blocked.
7. partly closed — guard.test.js and guard-case.test.js run in full ×3 platforms (guard-platforms.test.js). Open: no commit message or (unchecked) PR body names the changed allow cases.
BUILDER (a) env-prefix list: not a defect — every other name fails closed; none of the 8 runs code.
BUILDER (b) \bGIT_ case-insensitive on win32: not a defect — conservative and correct.

--- finding 8 ---
severity: high
file:     .claude/hooks/guard.js (FORMS.npx, NPX_TOOLS; FORMS.node); bug.md G.16 lists `npx prettier` with no form
claim:    `npx prettier` in any form prints every file it matches; directory and quoted-glob arguments are expanded by the tool, not the shell, and the guard treats them as literal text, not a search.
failure:  allowed ×3 platforms, direct and via all + agent_type; run in the throwaway root (prettier 3.8.1):
          CRITIC: npx prettier '*/*/*otes.md' → "SECRET"; npx prettier . → includes notes.md
          TEST ENGINEER: npx prettier apps/web → "SECRET;"; npx prettier '**/s*/*.ts' allowed
          TEST ENGINEER: node --test '**/s*/a.ts' → "# SECRET / ReferenceError" (node prints the failing source line)
fix:      allow prettier only in a names-only form (--check / --list-different) or take it off the list (spec change — DECISION REQUEST). Treat a directory or quoted-wildcard argument to npx tools and node --test as a search rooted there, under the recursive-grep reach rules. Block cases for each line.
--- end ---

--- finding 9 ---
severity: medium
file:     .claude/hooks/guard.js (FORMS.npm: `if (a === '--') break;`)
claim:    arguments after `npm run <script> --` are not checked; npm appends them to the script, and tokens:check ends in `git diff --exit-code -- <path>`, so they become git pathspecs outside the git rules.
failure:  CRITIC ×3: npm run tokens:check -- '*otes.md' | -- ':(icase).WORK' | -- .work allowed; TEST ENGINEER: -- apps/web allowed. In the throwaway root it printed "diff --git a/.work/f/notes.md …" (uncommitted hunk). Limited to uncommitted changes.
fix:      refuse arguments after `--` for npm run/test, or allow them only for test scripts and run them through the path rules as pathspecs. Block case.
--- end ---

G.19 note for debt.md: the role can write .git/config or .git/hooks/* by shell redirection (printf '[core]\n\tfsmonitor = "…"' >> .git/config); a later git status prints notes.md. Cheap to close: block redirection targets under .git/.
Accepted cost: gh is off the list, so CRITIC cannot read PR bodies or CI checks from the shell.
```
