# notes — F1.3 register-profile-step

## Pass a (criteria 1-5): schemas, value lists

**Approach**  Value lists and every bound in `packages/shared/src/constants/registration.ts`. Pure helpers in
`validation/text.ts` (trim U+0020 only, code-point count) and `validation/dates.ts` (date parts -> real date, add days,
local "today"). `fullNameSchema` (`names.ts`) and `createRegistrationStep1Schema(today)` (`registration-step1.ts`).
Typecheck and eslint pass. Nothing run against a DB or a test.

**Decisions**
- Identifiers were not fixed by the SRS: stages `planning | pregnant | has_child`; child sex `boy | girl | unknown`.
- The step-1 schema takes the form as typed (all strings, date as day/month/year texts), so one schema serves the
  web form now and F1.4's route. All checks run inside one `transform`, so an unticked section's junk never fails
  the form and never reaches the output (Q3, criterion 4). Output: `children: []` and `dueDate: null` when unticked.
- Issue messages are stable codes (`REGISTRATION_ERROR_CODES`), not texts. Pass c maps code -> DR-4 text, tagged VAL/ERR.
- Codes with no DR-4 text, so they fall to the generic message unless pass c adds one: `stage_conflict`,
  `stage_invalid`, `child_name_length`, `birth_date_out_of_range`, `due_date_invalid`, `parent_gender_invalid`,
  `child_sex_invalid`, `children_required`, `children_too_many`. `due_date_invalid` could share the "date does not exist" text.
- Child birth date partly filled or empty both give `birth_date_required` (DR-4 "date missing").
- `localDateIso(now)` is in shared (Q6, local date); it uses `Date` only, no DOM.
- Names that are only a tab are not empty: `"\t"` is 1 code point, so `full_name_length`, like btrim in Postgres.

**Deviations**  None.
**Deliberately not done**  No tests (TEST ENGINEER). No SRS edit (step 14). No `types/` or `errors/` folders used.
**Uncertain**  Zod 4 `ctx.issues.push` in `transform` is the API I used; the typecheck accepts it but no run has proven it.

**Needs testing (TEST ENGINEER)**
1. `fullNameSchema` table from the spec, plus the same table against `regular_profiles_full_name_check` in a pgTAP test
   (supabase/tests, next to 14_identity_constraints.sql).
2. Stage combos (7 non-empty subsets: 5 ok, planning+pregnant fails with and without has_child), unknown, repeated;
   parent gender ok/absent/empty -> null/other fails; child sex three values, empty, other.
3. Birth date: 29.2.2024 ok, 29.2.2025 and 31.4 fail, today ok, tomorrow fails, 1899 fails, 1900-01-01 ok, output
   YYYY-MM-DD, leading zeros optional, year "0050" invalid; `today` fixed by the test.
4. Children 0/1/10/11; unticked has_child drops children; due date empty -> null, partial fails, window edges
   (today-30, today+300 ok; one day beyond fails); unticked pregnant -> null.
5. Typecheck without DOM (already the shared tsconfig: `types: []`); change a constant (e.g. MAX_CHILDREN) and the
   schema follows without editing apps/web.

**Preview path**  None for this pass.
**Neighbouring**  None.
