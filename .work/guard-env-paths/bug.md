# Bug — the guard's env-file rule blocks text that mentions the name

**Path:** bug fix, Elevated (a guardrail: every guard change goes through CRITIC on opus). **Product risk flags:** none.
**Source:** Afik's decision of 13.10.2026 (`decisions/2026-10.md`, "The guard's env-file rule (R4) judges path arguments
and redirection targets, not text"): "כן: לבדוק רק ארגומנטים שהם נתיב (כולל < >). גישה לקבצי .env נשארת חסומה לגמרי —
התיקון רק מפסיק חסימה של טקסט שמזכיר את השם. Not Ready → ל-debt וממשיכים."
**SRS trace:** none — an agent-team guardrail. **Evidence:** `noise.md` 2026-10-11, 13.10 ×4; `.work/agent-slim/stage2-insights.md`
pattern 4. Every false block is r4-critical and writes an `incidents.md` line.
**Also in this unit (F5, Afik 13.10):** the guard's comments and its escalation message say "in one task", not "in one
session" — `/wrap-up` 1.2 now rotates the block log at the end of each task. Wording only; the counting code is unchanged.

## The rule (unchanged in intent)

No shell command reads, writes, copies, sources or otherwise touches an env file. An **env file** is any file whose name
is `.env` or `.env.<anything>` (case-insensitive on Windows), except a name ending in `.example`, which is a committed
template. A block of this kind is r4-critical, as today, with the same reason text.

## Actual

`namesEnvFile` matches the command text: any `.env…` word anywhere — a grep pattern, a commit message, an echo, a table
row inside quotes — blocks as critical.

## Expected

The env-file check looks at **path arguments and redirection targets** of every shell segment (nested `bash -c`, `sh -c`,
`eval`, `powershell -Command`, `cmd /c` included), plus the text of **inline interpreter code**.

**Still blocked** (each is r4-critical). Existing cases in `guard.test.js` → "all: no shell access to .env files…" stay as
they are. In addition:
- a redirection target, with or without a space and with any operator: `cat < .env`, `cat <.env`, `echo x >.env.local`,
  `echo x >> .env`, `cmd 2> .env`, `cmd &> .env`, `cmd >| .env`
- a path argument in any position, quoted or not, with any directory prefix, `\` or `/`: `cat ".env.preview"`,
  `cat './.env'`, `cat apps/server/.env`, `type apps\server\.env.local`, `source .env`, `. .env`, `less .ENV` (Windows)
- the value of an option or assignment: `node --env-file=.env x.js`, `node --env-file .env x.js`, `F=.env; cat $F`
- a glob that the shell could expand to an env file: `cat .env*`, `cat .en?`, `cat .e*`, `cat .*`, `cat apps/server/.env*`
- a search whose **file** argument is an env file: `grep URL .env.local`, `rg x .env`
- inline interpreter code that names an env file, anywhere in its text: `node -e "…'.env.preview'…"`, `node -p …`,
  `python -c …`, `perl -e …`, `ruby -e …`, and a heredoc fed to an interpreter (as today)

**No longer blocked** (each exits 0 for role `all`, given nothing else in the command is blocked):
- a search pattern: `grep -n ".env" noise.md`, `grep -rn "\.env" .claude/knowledge/conventions.md`,
  `rg -e .env docs/`, `git grep ".env.preview" -- docs`, `git log --grep=.env`
- a commit or tag message: `git commit -m "docs: mention .env.preview"`
- text that is not a path: `echo "the .env file holds secrets"`, `printf '%s\n' "fill in .env.preview"`
- `.env.example` and other `*.example` names, as today: `cat .env.example`, `cp .env.example /tmp/x`
- names that only contain the letters: `cat src/env.ts`, `echo $NODE_ENV`, `cat .environment-notes.md` (neither `.env`
  nor `.env.<x>`)

A bare `.env` token that is the pattern of a search command (grep, egrep, fgrep, rg, `git grep`, `git log --grep`,
Select-String, findstr) is a pattern, not a path. Any other bare token whose last path component is an env file is a path.

## Reproduction

```
echo '{"tool_name":"Bash","tool_input":{"command":"grep -n \".env\" noise.md"},"cwd":"."}' | node .claude/hooks/guard.js all
```
Exit 2 and "Shell commands do not touch .env files" today; expected exit 0.

## Not in scope

A recursive search over a directory that holds an env file (`grep -r SECRET .`) — not caught today either; noted for
CRITIC, not part of this fix. A script file that reads an env file (`node x.mjs`) — not caught today either.
