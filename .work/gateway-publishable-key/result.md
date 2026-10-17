# result — I2 gateway publishable key for the caller-token Auth calls (PR 53)

**Execution:** Succeeded · **Quality:** Acceptable — merged PR 53 (17.10.2026). CRITIC (opus): one low (the password routes'
readiness now also needs the publishable key; fail closed, no exposure) → debt.md. No medium or higher.
**SRS trace:** §12 Authentication (the identities read and the global sign-out use the publishable key; Afik's decision) — in 2.21.
No FR/AC change.
**Evidence:** CI (db, test, typecheck, lint, build, audit) and preview-e2e green on the PR head (S-01 identity read, password change
and the reset sign-out on the deployed preview, c11). Server tests 756 passed locally. No migration.
**Lessons:** search the archive for a setting before listing it for Afik (the variable existed since 14.10; noise.md).
**Still open:** reset call 2 (`/token?grant_type=password`) keeps the secret key — question to Afik on WORKPLAN (default: stays).
