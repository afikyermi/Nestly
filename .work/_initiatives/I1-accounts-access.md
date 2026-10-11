# I1 — Accounts and access (Regular)

**Record, not status.** Approved by Afik on 11.10.2026 (D7, `decisions.md` → "D7 closed"). Status lives in
`WORKPLAN-HE.md` part 8. A material change is appended at the end with Afik's decision. The SRS is the source of
truth for every ID; SRS batch 2.9 updates the IDs marked † before the first SPEC of this initiative runs.

## Goal

A Regular user registers with a stage and children, accepts the terms, verifies the email, signs in and reaches the
protected shell. A Guest reaches nothing else. A suspended or banned account is stopped at once.

## Scope

| | |
|---|---|
| FR | FR-AUTH-001, 002, 003†, 004 · FR-REG-002, 003, 004 · FR-TOP-001 · FR-MENU-001 (Settings placeholder and Logout only) |
| PG | PG-001, PG-002, PG-004, PG-005 · AppShell |
| AC | AC-001, 002, 003†, 004, 005† (three destinations in the MVP), 016, 033, 055, 078 (non-guessable identifiers) · AC-017† is removed with the phone field |
| VAL · ERR · BR | VAL-001, 002, 003†, 005, 006† · ERR-001, 002, 003, 012 · BR-045 |
| Entities | User, RegularProfile, Child, JourneyContext, PrivacyPreference (default), consent record |
| Authorization layers | 1 Authentication · 2 Account type · 13 Enumeration (`data-model.md`) |
| Platform rules | identity transaction per request, `app_server` role, no BYPASSRLS, `is_active_account()` in RLS (`data-model.md`) |

**Out of scope:** professional registration and account-type selection (PG-003, FR-REG-001 → I11) · profile
editing (I2) · profile photo (I5) · search, chat and notifications in the top bar (I7, I8).

## Decided inputs (11.10.2026)

- **Gender options (OP-004):**
  - Parent: אישה, גבר, אחר, מעדיפים לא לציין. The field is optional.
  - Child: בן, בת, עוד לא ידוע.
- **"בהריון":** an optional due date.
- **Password (VAL-003):** at least 10 characters, no composition rules, any character allowed, no blocklist. Supabase
  Auth settings match.
- **Email:**
  - Email only. No username and no phone.
  - Email verification is required before the first sign-in.
  - Password recovery goes by email.
- **Consent:** Terms of Use and Privacy Policy, with a recorded version and timestamp. The texts come in I9. Until
  then the links point to placeholders.
- **Age:** users are 18 and over.
- **Gender-neutral Hebrew:** NFR-USAB-003.
- **Design:** R2 screens (`docs/design/mockups/r2-screens.html`).

## Features

Each feature fits one context window (rule 6). They run in order; there is no parallelism within an initiative
(rule 5). Path: **Elevated** for every feature. Afik approves Gate 1, Gate 2 (plain-language `/gate`) and the
Preview.

| # | Slug | What | SRS | Gate 2 | Depends on |
|---|---|---|---|---|---|
| F1.1 | `identity-platform` | JWT verification via JWKS on the server · identity transaction per request · `app_server` role · User and RegularProfile with RLS · `is_active_account()` · non-guessable identifiers. If SPEC finds it larger than one window, it splits into an auth middleware and an identity schema | NFR-SEC-001, 002, 006(4) · AC-078 (part) | ✅ schema | WORKPLAN 7, 7.4 |
| F1.2 | `app-shell-guard` | AppShell · TopBar (no search, chat or bell yet) · bottom navigation with three destinations · minimal side menu · RouteGuard · Welcome | FR-AUTH-001, 004 · FR-TOP-001 · FR-MENU-001 · AC-001, 005†, 016, 033 · ERR-012 | — | F1.1, 9.7 |
| F1.3 | `register-profile-step` | step 1: stage, full name, optional parent gender, children (name, sex, birth date in three fields), add a child, optional due date for "בהריון" · Zod schemas in `packages/shared` | FR-REG-002, 003 · VAL-001, 005, 006† · AC-002 | — | F1.2 |
| F1.4 | `register-account-create` | step 2: email and password · consent with its version · atomic creation of User, RegularProfile, Child and JourneyContext · email verification · uniqueness without revealing that an account exists | FR-REG-004 · VAL-002, 003† · AC-002, 003†, 055 · ERR-002 · BR-045 | ✅ Child, JourneyContext, consent | F1.3 |
| F1.5 | `login-session` | email sign-in · an error that reveals nothing · logout · session refresh · suspended and banned accounts stopped at once | FR-AUTH-002 · AC-004 · ERR-001 | — | F1.4 |
| F1.6 | `password-recovery` | request, link and reset by email, without revealing whether the email exists | FR-AUTH-003† · PasswordRecoveryFeature | — | F1.5 |
| F1.7 | `auth-email-delivery` | transactional email provider for verification and recovery (a new external provider — CRITIC) · templates in gender-neutral Hebrew | SRS §12 Email · OP-014 | — | F1.4 |

## Exit criteria

- Every AC in scope is asserted by a test named after its ID.
- An RLS test shows that a query without an identity fails, and that a suspended account reads nothing.
- Every Preview is approved.
- The SRS reflects what was built: step 14 runs in each feature's `/wrap-up`.
- `escapes.md` and `noise.md` record what the gates missed or over-raised.
