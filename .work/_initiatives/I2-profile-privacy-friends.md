# I2 — Profile, privacy and Friends (Regular)

**Record, not status.** Scope approved by Afik (D7; roadmap Amendment 4, 16.10.2026); reserved points answered in
`I2-questions.md` (`decisions.md` 2026-10-16 "I2 questionnaire"). Status lives in `WORKPLAN-HE.md` part 8.
Runs under `workflow.md` 1.16: path per part, one review round per part, merge on green CI + E, a new session per part.

## Goal

An existing Regular user's account cannot be taken over through Google or through a held session; the user sees and
edits their profile, journeys and children, chooses Open or Restricted, connects with Friends, and reaches Settings.

## Features and parts

In order; each part is one PR. SPEC writes the criteria a feature lacks (F2.2, F2.5 have no AC in the SRS).

| # | Slug | What | SRS | Flags → path | Depends on |
|---|---|---|---|---|---|
| F2.0 | `account-takeover-close` | **S-01:** first Google sign-in into an account that has a password → old password cancelled, every other session signed out, a new password set before continuing; detection by `identities`. **S-16:** a password change only after answering two of the user's security questions, Google users included; no direct client password change; no email change in I2 | FR-AUTH-003, FR-AUTH-005 · NFR-SEC · `security-privacy-open.md` S-01, S-16 | auth · possible schema → **Elevated** | I1 |
| F2.1 | `profile-view-edit` | own profile view and edit (fields from what the SRS defines) | FR-PROFILE-001 | personal data · schema → Elevated | F2.0 |
| F2.2 | `journeys-children` | manage journeys and children, ≤ 10 | FR-PROFILE-002 | minors' data · schema → Elevated | F2.1 |
| F2.3 | `profile-privacy` | Open/Restricted (default **Open**, backfill existing to Open), Journey Summary toggle, ChildBirthdayVisibility (default **on**, BR-037) | FR-PRIV-001 · BR-037 | authz · minors · schema → Elevated | F2.1 |
| F2.4 | `friends` | request, accept, decline, remove; what a non-Friend sees per FR-PRIV-001 | FR-REL-001 | authz · schema → Elevated | F2.3 |
| F2.5 | `settings-menu` | Settings and side-menu destinations; account deletion not shown until I9 (U1) | FR-SET-001 · FR-MENU-001 | none expected → Standard | F2.0 |

## Decided inputs

Questionnaire answers 1–6 (`I2-questions.md`, "תשובות"), plus ORCHESTRATOR's notes there ("לידיעה בלבד").
Production migrate: ORCHESTRATOR dispatches once at I2's close (or daily), `gh workflow run migrate.yml --ref main`.

## Exit criteria

Every AC in scope has a test named after its ID · S-01 and S-16 marked closed in `security-privacy-open.md` ·
the SRS updated once at I2's close (`/srs-update`) · the I2 production migrate batch succeeded.
