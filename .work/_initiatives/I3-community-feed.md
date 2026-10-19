# I3 — Community feed and sharing · medical hotline referral (draft)

**Draft; Afik answered the questionnaire on 18.10.2026 (1א–8א, `I3-questions.md` → "תשובות"). I3 is not open.** Prepared on 18.10.2026 (Afik's overnight instructions, task 4) from
`roadmap.md` (I3 row, Amendments 1, 3, 4, 5) and the SRS. Status lives only in `WORKPLAN-HE.md` part 8. Reserved points
are in `I3-questions.md`; the ranking and data-use rules are in `I3-algorithm.md` (ALGORITHM & DATA). Runs under
`workflow.md` 1.16 (path per part, one review round per part, merge on green CI + E, a new session per part).

## Goal

A signed-in user sees a community feed as the landing page, posts and asks (also anonymously), comments, replies and
likes, shares a post into the feed or as a link that reveals nothing outside Nestly, reports content or a user, and
reaches the medical hotlines page. Every item shown is eligible first (RLS, audience, Friends, status, blocks/reports)
and only then ordered by the deterministic, versioned rules of `I3-algorithm.md`.

## Features and parts (proposal)

In order; each part is one PR. SPEC writes criteria where the SRS has none. Text only: images arrive in I5 (F5.x), so
I3's post body has no media and FR-FEED-002's images are I5's.

| # | Slug | What | SRS | Flags → path | Depends on |
|---|---|---|---|---|---|
| F3.0 | `feed-groundwork` | Post, Comment, Reaction, Report and AlgorithmConfiguration tables with RLS (audience "friends only"/"everyone", OP-033); removal of the cleanup tool's manual `backlog` mode (WORKPLAN "להמשך" 2; `debt.md`); cleanup knows the new tables | §13 · OP-033 · data-model rules | schema · authz · personal data → **Elevated** (DATA ARCHITECT) | I2 |
| F3.1 | `post-create` | create a post or question, text only; audience per post (preselected value: questionnaire 1); author edits/deletes own post (SPEC decides if the SRS lacks it → DECISION REQUEST if a privacy rule is touched) | FR-FEED-002 · OP-033 · VAL | personal data → **Elevated** | F3.0 |
| F3.2 | `feed-view` | the feed as landing page, infinite scroll (PG-008), empty and error states; eligibility before order; the I3 ordering of `I3-algorithm.md`; stage match as a signal, never a filter | FR-FEED-001 · FR-FEED-004 · FR-ALG-002 (subset) · AC-060 (subset) | authz → **Elevated** (+ ALGORITHM & DATA review) | F3.1 |
| F3.3 | `comments-likes` | comment, reply, one "like" reaction (Nestly icon), counts; mentions/tags and their notifications move to I7 (placement, see below) | FR-FEED-003 | authz · personal data → **Elevated** | F3.2 |
| F3.4 | `anonymous-post` | anonymous posting for Regular users only; "המחבר" in its thread; no social-graph candidacy or Social Relevance; Admin-only real author (the Moderator reveal is I4) | FR-FEED-005 · AC-075 · AC-076 (I3 part) | authz · personal data → **Elevated** (+ ALGORITHM & DATA) | F3.3 |
| F3.5 | `share-in-feed` | share a post into one's feed with optional text; reference only; share of a share shares the original; "no longer available" | FR-FEED-006 · BR-064–066 · VAL-038 · AC-079–086 (share part) | authz → **Elevated** | F3.2 |
| F3.6 | `share-link` | link to a post or the site (WhatsApp, email, copy, device share sheet); unguessable id; generic preview; sign-in then back to the post; "unavailable" for a viewer without permission | FR-FEED-007 · BR-067 · NFR-PRIV-007 · NFR-SEC-005/006 | new external surface (public URL, preview) → **Elevated** | F3.5 |
| F3.7 | `report` | report a post, comment or user: separate window over a slightly blurred screen, the 8 decided reasons ("content that endangers a child" first), optional free text; stored for I4's queue | FR-MOD-001 (report action) · decisions 16.10 "Before I3–I5" (3) | personal data · minors → **Elevated** | F3.3 |
| F3.8 | `medical-hotlines` | fixed page of `tel:` buttons (MDA 101 and the four HMOs' nurse lines, verified at build), "לא תחליף לטיפול רפואי", from the menu and community rule 2; taps not recorded | FR-MENU-002 · AC-109 · decision 16.10 "seven open details" (4) | none expected → **Standard** | I2 |
| F3.9 | `hide-post` | "hide this post" for oneself only; not a ranking signal, not stored as feedback (Afik 8א); "not interested" stays in I15 | FR-ALG-009 (subset: hide only) · P-ALG-06 | personal data → **Elevated** (+ ALGORITHM & DATA) | F3.2 |

**10 features**: the roadmap's 9 plus F3.9 `hide-post` (Afik 8א) (FEED-001..007 with FEED-004 inside the feed and ranking, MOD-001, the hotline page);
F3.0 is groundwork, not a feature. F3.8 is independent and can run in the second session beside F3.1–F3.3.

## Placement notes (ORCHESTRATOR, unreserved)

- **Mentions/tags (FR-FEED-003)** → I7, with the notifications they generate (FR-NOTIF-003); I3 builds comment and reply.
  Reason: a mention without its notification is half a behaviour, and I7 owns notifications and their rate limits.
- **Images in posts** → I5 (roadmap I5 row); **Stories (FR-FEED-008)** → I5 (decision 16.10 "Placement").
- **Reports are stored in I3, handled in I4** (queue, ladder, Moderator reveal of an anonymous author).
- **Groups as a post target** → I10; I3's post targets the feed only.

## ALGORITHM & DATA (`I3-algorithm.md`)

- Eligibility only in RLS; one organic pool (own, Friends', "everyone" posts incl. anonymous, shares); deterministic
  versioned score; per-author and anonymous caps; snapshot cursor; last-good / built-in recency fallback; no events in I3.
- DR-1–DR-4 → `I3-questions.md` 6, 5, 4, 7. DR-5 (ORCHESTRATOR): AC-060 is tested in I3 on eligibility first, Friends,
  freshness, quality, diversity and no ML; its other clauses in the Initiative that brings their data (I10, I11, I15).
  Ranking configuration changes only by a migration reviewed by ALGORITHM & DATA until I15's Admin tool (BR-059, AC-073).
- P-ALG-06: met in the MVP by F3.9's hide only (8א); "not interested" and its ranking effect stay in I15.

## Decided inputs

Afik: OP-033 (audience per post), community rules (8), report reasons (8), Reaction name "לייק", R2 (four card actions),
hotline page details, Stories in I5. Open for Afik: `I3-questions.md`.

## Open before I3 opens

- `I3-questions.md` answered by Afik.
- `I3-algorithm.md` accepted (its **Open** items are in the questionnaire).
- The workplan's system fix stage (P1–P7, `nestly-review/comparison.md`): P5 (cleanup aware of schema transitions) and
  P6/P7 (schema-first, one shared Preview cycle for two sessions) come before I3 ∥ I6 touch the shared Preview database.

## Exit criteria

Every AC in scope has a test named after its ID · the I3 production migrate batch succeeded · the SRS updated once at
I3's close (`/srs-update`) · security/privacy items opened in I3 are in `security-privacy-open.md`.

## שינויים ל-SRS (נכנסים ב-/srs-update; I3 לא נסגרת עם שורה פתוחה)

| # | שינוי | מקור | מצב |
|---|---|---|---|
| 1 | שמות מלאים למגיבים (Q7 ב) | decisions 19.10 | פתוח |
| 2 | `audience_not_allowed` (422) לאנונימי + חברים | F3.4 spec | פתוח |
| 3 | כללי טקסט דיווח (1,000 תווים) ודיווח חוזר; שורת "TBD Report Escalation" ב-§11 | F3.7 spec | פתוח |
| 4 | BR-064/AC-080: Restricted לא חוסם שיתוף; טווח AC-079–083 | F3.5/F3.6 specs | פתוח |
| 5 | FR-ALG-009/AC-064/UC-40 מול 8א; `post_hides` ב-§13 | F3.9 spec | פתוח |
| 6 | דפוסי אינטראקציה (direction.md): כתיבה במקום בראש הפיד במקום עמוד נפרד | אפיק 19.10 (UX) | פתוח |
| 7 | ליטוש UX של I3: הסטיות מבדיקת המסכים (רשימה למטה) | אפיק 19.10 (UX) | פתוח |

## ליטוש UX של I3

(נכתב אחרי בדיקת מסכי I1–I3 מול direction.md → "דפוסי אינטראקציה".)
