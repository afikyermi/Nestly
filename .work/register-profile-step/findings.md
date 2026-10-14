# findings — register-profile-step (F1.3), CRITIC (opus), 14.10.2026

(Written by ORCHESTRATOR from CRITIC's return; the harness refused CRITIC's Write.)

verdict: Not Ready — 1 high · 2 medium · 6 low

Checked, no finding: authorization (no server path, nothing stored, Guest only); criterion 15 (no request, storage or
console output of entered values); secrets; type honesty; symbol existence; Button type="button"; one primary action;
TEST ENGINEER's tests read no source; criteria 1–19 have code and tests; 20 is the Preview.

1 (high) error-texts.ts — due_date_out_of_range, child_name_length, birth_date_out_of_range show the generic "משהו השתבש.
  אפשר לנסות שוב": the user cannot tell what to fix (WCAG 3.3.1, 3.3.3). DR-4 gives no wording → DECISION REQUEST.
  Fix after the decision: map the three codes, texts built from the shared constants; generic only for codes the UI
  cannot produce. The "before 1900" unit test asserts the generic text and must change.
2 (medium) RegistrationFlow.tsx — `parsed` is never cleared: valid → Back → untick children / remove a card → Forward
  shows step 2 with the old value (a removed child's data). Criterion 12 and Q3 fail on this path; F1.4 would store it.
  Fix: clear `parsed` when step 1 changes the form; Forward with no fresh parse lands on step 1. Add a flow test.
3 (medium) field-message.tsx — FieldError/FieldHint copy FormField's error and hint lines (design-system forbidden item
  4). Fix: extract them into components/shared and use them in FormField and the group controls.
4 (low) ChildrenSection.tsx — child card `border border-border`, no shadow; product cards and R2 use shadow-card, no
  border. Fix: shadow-card, p-card-padding, no border.
5 (low) RegisterStepOne.tsx — field order differs from R2 (stage → name → gender → children) without a recorded decision.
6 (low) RegisterStepOne.tsx — after a failed "המשך", a newly added card shows three errors at once, each role="alert".
  Fix: errors only for fields present at the last "המשך" (or touched since); clearing stays live.
7 (low) RegisterStepOne.tsx showErrors — a production prop only stories use. Cleaner: a Storybook play function.
8 (low) ChildrenSection.tsx — child name input lacks autoComplete="off"; the browser may save a minor's name to its
  form history. Fix: autoComplete="off".
9 (low, for F1.4) registration-step1.ts — plain z.object (unknown keys stripped, not rejected) and no coarse size bound
  before Array.from. Fix at F1.4 Gate 2: .strict() and a coarse .max() on raw strings and `stages`.

## ORCHESTRATOR decisions (14.10)
- 1: texts decided (decisions/2026-10.md "F1.3 review"). → BUILDER.
- 2, 3, 4, 6, 7, 8 → BUILDER now.
- 5: the current order stays (fields open under their choice); recorded as a change to R2.
- 9 → debt.md, closes at F1.4 Gate 2.
