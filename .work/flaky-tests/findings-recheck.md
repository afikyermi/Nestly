# PR 65 — CRITIC re-check of round-1 findings #1–#3 (against 56c0dea)

Saved by ORCHESTRATOR from CRITIC's hand-back (CRITIC: "handback is the delivery channel here; this text is the file content").

| # | Verdict | Severity left | Note |
|---|---|---|---|
| 1 | Acceptably handled | none in the test; product bug recorded | The password half no longer claims "not by scanning"; the comment (test lines 177-179) says plainly it doesn't prove it and points to debt.md. Assertions (message set = `{password_length}` + `too_big` present) are honest for what they check; a regression removing the raw password bound while the refine still rejects would still produce `password_length`, but the `too_big` assertion catches that — not vacuous. debt.md line 120 records the product bug (refine runs after the raw `.max` failure: too_big + custom), web-only, cost and fix. Known, recorded defect under Afik's rule → no finding; severity low (one client-side scan of ≤5 MB; the server has its own body limits). Optional: "web-only" rests on the five apps/web call sites, count not re-verified. |
| 2 | Fixed | none | workflow.md:388 defines "Listed" as a `debt.md` line tagged `flaky:` (test, first failure, owner) entered after a diagnosis; :389 (listed: one rerun, record, continue; any other failure stops) now has a concrete artifact. debt.md line 119 shows the list in use and currently empty. test-engineer.md:125 matches. |
| 3 | Acceptably handled | low | Criterion ID in the tag, expiry ≤ 7 days, Afik told, expired = a blocker at part close; test-engineer.md:125 matches. Left: the expiry is not CI-enforced (ORCHESTRATOR says recorded in the audit plan, not visible in the diff). Scenario: a quarantined test's only coverage lapses between part closes; caught at close by the blocker rule — a human gate; window bounded by the part; the tag is greppable. Low. |

## The two other wall-clock tests (5 MB names → exactly ['too_big'])
Test 1 (5 MB fullName, lines 260-265) asserts issueCodes == ['too_big'] and messages == ['full_name_length']; test 2 (5 MB
emoji name and 5 MB child name, 266-275) asserts issueCodes == ['too_big'] for both. A scanning implementation cannot pass in
the realistic cases: without the raw `.max` nothing yields too_big (the scan would be a custom full_name_length or child
custom); if the transform ran after the bound failed, an extra custom issue appears and the exact list catches it. What is
unobservable is a scan whose result is discarded (extra work, no issue) — dropping the timing assertion accepted exactly
this; acceptable. The short-circuit is not a `.pipe` on the name: `registrationStep1Input` is a z.strictObject with
`fullName: z.string().max(RAW_NAME_MAX_UNITS)` (registration-step1.ts:42) and `createRegistrationStep1Schema` is a
`.transform` on it (:69); the child name is bounded the same way in `childInput` (child.ts:38); `checkName` runs only inside
the transform (:87, child.ts:65), which does not execute when the input schema already has issues — so the raw-bound failure
is the only issue by construction. Wording nit: the test comment "the raw bound stops the pipe" is accurate in spirit; the
`.pipe` label fits profile.ts:15, not step 1.

## New defects introduced by 56c0dea
None in the three files re-checked.

## Done · Artifact · Findings · Open · Next owner
Done: re-check of #1–#3. Findings: #1 acceptably handled (debt.md line 120); #2 fixed; #3 acceptably handled, residual low
(no CI-enforced expiry). The two 5 MB-name tests are sound. No new defects. Open: CI-enforced quarantine expiry (audit
plan). Next owner: ORCHESTRATOR (close the round; merge once the temporary ci.yml proof commits are reverted).
