# findings — Preview cleanup fix (CRITIC, 17.10.2026, one round)

--- bug ---
severity: low
file:     tools/preview-e2e-cleanup.ts:515 (runBacklog), :406
claim:    backlog mode has no wrong-pattern ceiling and stays in the workflow permanently.
fix:      ORCHESTRATOR: backlog is one-shot — after the backlog since 16.10 is cleared, a follow-up PR removes the `backlog`
          mode (dry-run stays). Tracked in debt.md until then.
--- end ---

--- bug ---
severity: low
file:     tools/preview-e2e-cleanup.test.mjs:447, :201-211, :393-397
claim:    new tests read source as text (CLI SQL substrings; table list vs migrations).
fix:      debt.md (same pattern as the 2026-10-14 source-scans entry).
--- end ---
No critical, high or medium bug.
