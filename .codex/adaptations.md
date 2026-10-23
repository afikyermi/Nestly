# Codex adaptations of rules and skills

Where Codex applies a `CLAUDE.md` rule or a `.claude/skills` procedure differently from how it is written. Baseline
list in `AGENTS.md` §4. Add a line per new case: date · rule/skill · what Codex does instead · why.


- 22.10.2026 · GitHub writes: the connector reads runs but Actions/PR/ref writes return 403; the sandboxed CLI returns 401 despite Afik's successful Windows login. After Afik signed into the in-app browser, reruns and the PR body update succeeded through GitHub's UI. Use that UI for remote writes and connectors for reads; never extract browser cookies or credentials. Records are reproduced from the checked local content through the web editor, then fetched and compared locally; commit IDs may differ while file content must match. Local commits are preserved; no force-push or reset.
- 22.10.2026 · srs-lookup Brief: the user's records restriction keeps Codex's brief refresh in .codex/briefs/I13.md, referencing the existing .work/briefs/I13.md; the source skills remain in .claude/skills and are read when required. A separate read-only requirements pass supplied the refresh.

- 22.10.2026 · Git commit hook runner: Git for Windows sh.exe exits with -1073741502 (DLL initialization failure), so git commit cannot start the hook. Run the exact two hook checks directly via Node (tools/check-budgets.mjs and guard.scanForSecrets on the staged diff), require both to pass, then use git write-tree/commit-tree/update-ref. core.hooksPath remains .githooks; no check is skipped and no rule file is edited.
