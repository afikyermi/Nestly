# F1.6 part c — CRITIC findings (sonnet, base d6b86d7 → HEAD d2713e1)

Saved verbatim by ORCHESTRATOR from CRITIC's hand-back (the harness refused the subagent's write).

**Verdict: Validated with Concern.** Cost carried: the held-state rule in `decideAccess` is covered only by the Chrome
E2E, with no unit test; the new recovery texts have no ERR items yet (DR3 at Initiative close).

## Checked and sound
- Held state cannot be escaped by route or reload. `decideAccess` sends everything except `/recovery-questions`, `/terms` and `/privacy` to the questions screen, and the signed-in branch runs before the Guest-path redirect. Sign-out resets the flag (`endLocally` passes false).
- Answers, password and email stay in component state only; no web storage, URL or history state; `navigate` uses `replace` with no state.
- Criterion 19: `/api/me` failing or unparseable gives `failed`, or `active` when the field is not exactly "missing"; never a hold. F1.5 fail-closed paths unchanged.
- Test seam `setNeedsRecoveryQuestions` is reachable only through the dynamic import under `MODE==='e2e'` in `main.tsx`; not in the production bundle.
- Tests read no source or notes at run time; expected values trace to criteria 16–19. Criteria 16–18 covered incl. keyboard, axe at 375 and 1024, busy state.
- `e2e/visual-screens.ts` matches the 🎨 criteria.
- Copy is gender-neutral; "ענו" / "בחרו" are the spec's wording.
- Not verified by eye: target size at 375 and sticky-nav overlap (relies on the c18 fix and axe).

## Findings (all low)
1. **Stale recheck re-holds a user who just saved.** `apps/web/src/services/session/auth-session-source.ts:109-125` (`decide`) with `:282` (`markRecoveryQuestionsSet`). A recheck started before the save can return `active-missing` after `markRecoveryQuestionsSet`; the epoch check does not catch it. The user is bounced from `/feed` back to setup mode; the second save gets 409, treated as done. No data loss, no security effect. Fix: bump `epoch` in `markRecoveryQuestionsSet`, or ignore an `active-missing` answer that began before the mark.
2. **No unit test for the held-state decision.** `apps/web/tests/app/access-decision.test.ts`; code `apps/web/src/app/access.ts:14-18`. Nothing asserts `decideAccess('signed-in', …, needsQuestions=true)` (render for the questions screen; redirect for `/feed`, `/home`, `/profile`, `/settings` and Guest paths; no change when false). Fix: table-driven cases from the spec Status line.
3. **/terms and /privacy render for a held user.** `apps/web/src/app/access.ts:7`. The spec names no exception. Not an escape (placeholders, no route to the feed); an unstated product decision. Fix: remove, or record in the spec as intentional.
4. **Copy.** `apps/web/src/lib/recovery-texts.ts:7,9`; `apps/web/src/features/recovery/recovery-form.ts:701`. (a) Mismatch, lock and unavailable texts have no ERR item in SRS §10 — pending trace for DR3. (b) The password error always says "at least N characters", also for an over-long password (257, VAL-003 max). Fix: (a) DR3 adds the ERR rows with exactly these strings; (b) a text covering both bounds or picked by the failed bound, consistent with F1.4.
5. **Criterion 19 thinly tested.** Only `/api/me` failing right after registration. Nothing asserts a 200 lacking `recoveryQuestions`, or holding an unknown value, leaves the user on `/feed`. Fix: unit test for `fetchAccountState`: "missing" → `active-missing`; "set", absent, null, unknown → `active`; unparseable → `failed`.

**Open:** DR3 must add the ERR rows (4a); the exception in 3 needs a decision or removal.

## Re-check (CRITIC, sonnet, fix commit 1d344e0) — verdict: Validated with Concern
Saved by ORCHESTRATOR from the hand-back. 1 Closed (`epoch` bumped in `markRecoveryQuestionsSet`, `auth-session-source.ts:282-286`; recheck drops a stale answer `:158-161`) · 2 Closed (`access-decision.test.ts:121-127`) · 3 Closed (Amendment 4, reasoning accepted) · 4a Closed as recorded (ERR rows → DR3) · 4b Not closed, not blocking: one text for both password bounds on `/recovery` and F1.4 registration → `debt.md` · 5 Closed (`account-state.test.ts`). No critical or high finding stands.
