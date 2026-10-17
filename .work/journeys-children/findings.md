# findings — F2.2a journeys-children (CRITIC, 17.10.2026, one round)

Input: `review.diff` (vs origin/main), `spec.md` c1–c13 + Gate 1, `schema.md` + Gate 2. `notes.md` not read (cold-eyes rule).

no bugs

# findings — F2.2b1 (CRITIC, 17.10.2026, one round)

--- bug ---
severity: low
file:     apps/web/src/features/journeys/JourneysSection.tsx:189
claim:    A 409 `stage_conflict` from POST /api/journeys shows the generic retry text, and every retry gets the same 409.
failure:  Two tabs; tab 1 adds a pregnancy; tab 2 still shows "הוספת הריון", saves → 409; SAVE_FAILED_TEXT, form stays open,
          every retry 409 again, the stored pregnancy never appears until a manual reload.
fix:      On `stage-conflict`, close the form and refresh with GET (the Q3 pattern c25 uses for 404).
--- end ---
No other bug.
