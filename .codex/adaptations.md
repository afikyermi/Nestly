# Codex adaptations of rules and skills

Where Codex applies a `CLAUDE.md` rule or a `.claude/skills` procedure differently from how it is written. Baseline
list in `AGENTS.md` §4. Add a line per new case: date · rule/skill · what Codex does instead · why.


- 22.10.2026 · GitHub writes: the connector reads runs but Actions/PR/ref writes return 403; the sandboxed CLI returns 401 despite Afik's successful Windows login. After Afik signed into the in-app browser, reruns and the PR body update succeeded through GitHub's UI. Use that UI for remote writes and connectors for reads; never extract browser cookies or credentials. Records are reproduced from the checked local content through the web editor, then fetched and compared locally; commit IDs may differ while file content must match. Local commits are preserved; no force-push or reset.
- 22.10.2026 · srs-lookup Brief: the user's records restriction keeps Codex's brief refresh in .codex/briefs/I13.md, referencing the existing .work/briefs/I13.md; the source skills remain in .claude/skills and are read when required. A separate read-only requirements pass supplied the refresh.

- 22.10.2026 · Git commit hook runner: Git for Windows sh.exe exits with -1073741502 (DLL initialization failure), so git commit cannot start the hook. Run the exact two hook checks directly via Node (tools/check-budgets.mjs and guard.scanForSecrets on the staged diff), require both to pass, then use git write-tree/commit-tree/update-ref. core.hooksPath remains .githooks; no check is skipped and no rule file is edited.

- 23.10.2026 · Vitest: sandbox worker temp paths produced ENOENT before tests loaded. Set TEMP/TMP to the task workspace work/vitest-temp; the same 8 login/registration suites then passed all 176 tests. No product code or test expectations were changed for this environment issue.
- 23.10.2026 · Branch synchronization: merge main normally to resolve #177 WORKPLAN conflict, preserving incoming main records. This avoids the forbidden force-push of an already published branch. Use rebase-and-merge only after current PR/main CI are green.

- 23.10.2026 · Local full Chrome teardown: Playwright-owned Windows servers hung after assertions. Start the already-built Storybook and app on this checkout's hashed ports, allowing the unchanged configuration to reuse them. The complete run then exited normally; stop the two owned server sessions after verification. No timeout or coverage change.

- 23.10.2026 · Full test:tools in Windows sandbox: 1218 passed, 26 failed, 152 skipped. The failures are guard-loader Git/sh named-object access denial and a guard worktree symlink EPERM; targeted Preview harness is 168 pass/11 bash skips. Do not change those guard tests or claim the full local gate passed; require Linux CI on the complete commit.

- 23.10.2026 · Afik will be away from his computer: never ask him to run PowerShell. Request the required tool permission and perform the action directly; GitHub remote writes continue through the signed-in UI.
- 23.10.2026 · Final #177 merge: GitHub reports rebaseable=false; current main is already an ancestor and the published branch contains normal merges. Use an ordinary merge commit after green current PR/main CI, preserving history and avoiding the forbidden force-push.

- 24.10.2026 · In-app browser localhost navigation twice blocked for over four hours; GitHub UI remains responsive. Do not use IAB for local preview here. Validate local screens with the project Playwright suite and bounded CLI screenshots; public static privacy disclosure was inspected from the saved screenshot. Invoke npm/Playwright CLIs through Node directly to avoid slow Windows shims.
- 24.10.2026 · Delegated implementation required separate pending permissions despite the root grant; no agent edits occurred. Root applies patches and runs writes/network, agents remain read-only. New security-1024 worktree was created in the AGENTS-specified .work/wt location from origin/main for the urgent red-nightly dependency fix. Local npm ci hits workspace symlink EPERM; Linux CI is required, audit lockfile check passed.

- 24.10.2026 · #177 has no GitHub Update branch control and rebaseable=false. Merge current main locally without rewriting history, publish the resulting file content through the editor, and require the proposed tree to equal the automatic merge result with current main. Remote web-equivalent commits need not share local parent IDs; final ordinary merge joins the real remote histories.
