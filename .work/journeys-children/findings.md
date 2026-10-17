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

## Re-check — F2.2b1 low (409), fix c14470e, 17.10.2026
**Fixed.** On 409 the form closes and a GET refreshes the view with no error; focus to the pregnancy's "עריכה", else "הוספת הריון", else "הוספת ילד"; a failing refresh keeps the generic failure; 401/403 on the refresh recheck once. `DateInput` `optional`: accessible name "תאריך לידה משוער (לא חובה)"; callers without it unchanged. New bugs: none.

# findings — F2.2b2 (CRITIC, 17.10.2026, one round)

--- bug ---
severity: low
file:     .work/journeys-children/spec.md (c20); data-model-tables.md journey_contexts "Retention"; schema.md "Retention §13.4"
claim:    c20's "no … log line records that it ended" cannot hold on this platform: Vercel's request log keeps
          DELETE /api/journeys/<uuid> 200 + time + client IP; Supabase's auth log keeps user id + IP + time on token
          refresh; matching them ties a pregnancy end to a user. The application itself logs nothing (logger off in
          production; tests log the route pattern only).
fix:      Afik decides (privacy): record the platform request-log residue beside the backups FYI (Privacy Policy, §13.4)
          and reword c20 / the knowledge cell to "no application log line, column or row records it".
--- end ---
No code bug. Nothing critical, high or medium.
