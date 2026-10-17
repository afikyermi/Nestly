# P2 — short consistent contracts

Owner: Codex. Approval: אישור אפיק 17.10; implementation requested 18.10.
Requirements: process-only approval P2 in comparison.md; Implements: none — agent contracts/tooling.
Scope: active instructions, archived history, prospective document budgets and context measurements.
Out of scope: SRS, guard, CI workflows, Vercel, migrations, historical .work artifacts, preview.
Data touched: none. Risk flags: none for product data; this changes future agent guidance.

Acceptance criteria:
1. Canonical sequence: TEST ENGINEER beside BUILDER, execute after handoff, CRITIC after tests, then CI.
   Assertions come from spec/bug; source reads only identify names/seams. E remains automated.
2. CLAUDE preserves security/authority/routing near 8KB; governance and records have explicit destinations.
3. Agent changelogs and prior decision navigation are archived without loss; decisions.md is <=8192 bytes.
4. Data model has a short read map and table-section index; read only affected tables/dependencies.
5. New spec/schema/notes enforce 100/150/30 physical lines, UTF-8 bytes and readable line length.
   Existing historical paths remain exempt; new paths stay checked after commit, including untracked files.
6. Exact-path security exceptions require owner, reason, scope and finite caps; invalid/stale exceptions fail.
7. No required interface output: unique contracts belong in spec/schema before retiring an active reference.
   Existing historical artifacts remain intact; records belong with work and small local commits are allowed.
8. P1 Closing a part and part-status are preserved; all moved restrictions and role read bundles are reported.

Verification: budget CLI fixtures (new/history/exception/UTF-8/folding), preservation/diff audit,
context measurement, npm run ci in a copy excluding environment files. DB verification belongs in GitHub CI.
No changed UI to exercise in a browser; no Preview required by Afik.
Size estimate: instruction reorganization across ~30 files; archive growth is preservation, not new rules.
Open: none on approved scope. Any new reserved decision returns to Afik.
