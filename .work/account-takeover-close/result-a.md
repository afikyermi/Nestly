# result — I2 F2.0 part (a) account-takeover-close (server + schema)

**Execution:** Succeeded · **Quality:** Good — merged PR 38 (`5bd7344`, 16.10.2026, pre-approved merge); CRITIC (opus) 1 high (password sets not serialised with the clear) + 1 low, both fixed (Gate 2 A4/A5), re-check clean.
**Planned vs actual:** spec (a) ~380 product lines → see `git diff --stat f478fc4 5bd7344`; c16 moved into (a) (Gate 2 note).
**SRS trace:** implemented S-01, S-16 (passwords) — FR-AUTH-003 (password change), FR-AUTH-005 (takeover clear), §12 exception (a) widened (AR-1); SRS 2.20 written in this part (security model, at once). S-64 opened (email change, AR-2).
**Evidence:** CI 38979006906 green on `548ba30`; preview-e2e 38979061199 32/32 on re-run (attempt 1: 2 bypass-helper flakes at 375 → debt.md); migrate 38978016660 (nestly-preview, from the branch) success.
**Decisions:** DR-O1–O3 (Gate 1), DR-S1/DR-S2/Q-S1 (Gate 2), DR-T1 (body validation first) — in spec.md / schema.md.
**Not yet effective:** S-16 until Afik turns on the two Supabase password settings; part (b) screens.
