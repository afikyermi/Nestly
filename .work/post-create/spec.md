# post-create (F3.1) — write, edit and delete a text post

**Problem**        A signed-in Regular user cannot put a question or post into the community, choose who
sees it, or take it back. F3.0 built the tables; nothing writes to them, so F3.2 has nothing to show.

**Requirements**   FR-FEED-002 (feed.md; text only, images are I5) · OP-033 (audience per post, closed) ·
Afik 1א (preselect "everyone", last choice remembered), 3א (immediate permanent delete; held if an open
report), 5א (optional author-chosen tag, never derived) · BR-062/VAL-036/FR-FEED-005 only as a refusal ·
Post length VAL: **SRS gap** (VAL-009/016 TBD; VAL-038 points at "the post limit"); proposed here, ID
assigned at I3's `/srs-update`. Data: feed-groundwork schema.md and schema-b.md.

**Scope**          Shared Zod and `POST_BODY_MAX` · server `POST /posts`, `GET|PATCH|DELETE /posts/:id`
(route → service → repository; delete via `delete_post(uuid)`) · body-length CHECK on `posts` ·
web: "כתיבת פוסט" button on the feed placeholder → composer `/posts/new` · own-post page `/posts/:id`
with edit and delete · Hebrew, RTL, WCAG 2.2 AA, design-system components.

**Out of scope**   Anonymous toggle and all anonymous handling: F3.4 owns it. Boundary and why: an
anonymous post cannot be shown, edited or deleted by its author without `post_authors` reads and F3.2's
display rules, so the toggle here would be unverifiable; F3.1 refuses `isAnonymous` (criterion 2). Also:
feed list and cards (F3.2), comments/likes (F3.3), shares (F3.5/6), reports and purge job (F3.7),
images, mentions, groups, Professional posting (I5/I7/I10/I11), topic tags, posts-by-me list, edit
history or "edited" label, drafts, rate limiting, analytics events (4א).

**Data touched**   `posts`: insert and update body, audience, stage_tag; delete via `delete_post`; reads
by explicit column list. New CHECK on `posts.body` (DATA ARCHITECT). Grants unchanged.

**Risk flags**     personal data (post text, stage tag) · schema migration (CHECK) → **Elevated**.

**Acceptance criteria** (U unit · I integration, real DB under RLS · E e2e · P pgTAP)
1. 🟡 [U] New length VAL: `createPostSchema` trims `body`; `""` and `"   "` fail `body_required`; 2,000
   code points pass; 2,001 fail `body_too_long` (code points, so Hebrew text with emoji counts fairly).
2. 🔴 [U] BR-062/VAL-036: both schemas are strict. Keys `isAnonymous`, `authorId`, `status`,
   `sharedPostId`, `id` are rejected (400 at the route); `audience` outside `everyone|friends` and a
   `stageTag` outside `JOURNEY_STAGES` (e.g. `"topic-x"`) are rejected; `stageTag` null/absent is valid.
3. 🔴 [I] FR-FEED-002: `POST /posts` `{body, audience:"everyone"}` by an active Regular user → 201
   `{id, body, audience, stageTag:null, createdAt}`; stored row: `author_id` = caller,
   `is_anonymous=false`, `status='active'`.
4. 🔴 [I] No token → 401, no row; a Professional → 403, no row; a suspended account → 403, no row.
   The 403 comes from the database (23503/42501) mapped by `pg-error.ts`; the server adds no filter.
5. 🔴 [I] 5א: a Regular user with a pregnancy and a child profile posts without `stageTag` → stored
   `stage_tag` null; with `stageTag:"pregnant"` → `pregnant`. Nothing reads `journey_contexts`.
6. 🔴 [P] Body-length CHECK, **independent of which migration PR carries it** (P6: schema-only PR before
   F3.1a's code; ORCHESTRATOR may fold it into F3.0b): 2,000 characters insert; 2,001 → 23514 on insert
   and update; share text is capped by the same CHECK; the test lives with the migration, up → down → up.
7. 🟡 [U] Error mapping: 23514 on the body CHECK → 422 `body_too_long`; 42501 and 23503 → 403
   `not_allowed`; any other pg error → 500 `server_error`; no response carries a pg message,
   constraint or table name.
8. 🔴 [I] `PATCH /posts/:id` by the author updates `body`, `audience`, `stageTag` (null clears) → 200
   with stored values; empty body → 422; `isAnonymous` in the payload → 400, row unchanged.
9. 🔴 [I] `PATCH` by another active user who can read the post, or on an unknown id → 404; row
   unchanged; the response never distinguishes "not yours" from "missing".
10. 🔴 [I] 3א: `DELETE /posts/:id` by the author, no open report → 204; no row remains; its comments,
    likes and hides are gone; a second `DELETE` → 404.
11. 🔴 [I] `DELETE` by a non-author → 404, post remains. `DELETE` by the author on a post with an open
    report (fixture) → the same 204 as 10 (the author never learns of a report); afterwards
    `GET /posts/:id` is 404 for the author and for every other user.
12. 🔴 [I] `GET /posts/:id`: an eligible viewer gets the post, `isMine` true only for the author; a
    stranger on a `friends` post, a suspended viewer, a deleted or hidden post → 404, identical body.
13. 🔴 [U] Static test on the repository: every `posts` query lists its columns (no `*`, no
    `returning *`) and has no `where` on `author_id`, `audience` or `status` for permission; queries
    run in the identity transaction under `authenticated`.
14. 🎨 [E] A Regular user on the feed page sees "כתיבת פוסט" → `/posts/new`. A Professional does not,
    and `/posts/new` directly shows "הפעולה אינה זמינה", not the form. No anonymous control in the DOM.
15. 🎨 [U] OP-033/1א: audience is a labelled radio group "מי יראה את הפוסט": "כולם" (preselected when
    nothing or an invalid value is stored) and "חברים בלבד". After a successful post with
    "חברים בלבד" the composer preselects it next time (localStorage key per user id); a failed post
    stores nothing.
16. 🎨 [U] A11y: textarea with visible Hebrew label and `dir=rtl`; counter announced politely
    (`role=status`) only at ≤100 characters left; an invalid submit shows `field-message` via
    `aria-describedby` and focuses the first invalid field; the optional tag group defaults to
    "בלי תגית" with hint "התגית תוצג לקוראים"; axe 0 violations; submit disabled while pending (double
    click sends one request); touch targets ≥ 44 px.
17. 🎨 [E] After a successful post the user lands on `/posts/:id` with `role=status` "הפוסט פורסם",
    the text, audience label, tag if chosen, and a link "חזרה לפיד". On 403 or 5xx the composer stays,
    the text is kept, and an `inline-alert` shows a Hebrew message without technical detail.
18. 🎨 [E] On `/posts/:id` the author sees "עריכה" and "מחיקה"; others see neither. Edit opens the form
    prefilled and saving shows the update. Delete opens a `confirm-dialog` "המחיקה מיידית ולצמיתות"
    with focus on cancel; confirm → feed page with status "הפוסט נמחק"; cancel or Esc changes nothing.
    A 404 shows "הפוסט אינו זמין" with a link to the feed.

**Open questions**
- **DECISION REQUEST (Afik; report policy, reserved):** an author can edit a post with an open report and
  change the evidence (3א closed this for delete). Blocking the edit would reveal the report.
  **Recommend:** allow the edit; I4's report row snapshots the reported text. **Non-blocking default:**
  edit allowed, no snapshot; F3.7/I4 told to add it; item to `security-privacy-open.md`.
- Body limit → **decided:** 2,000 code points. Enough for a long personal question (~350 Hebrew words),
  short enough for a scannable card; one shared constant plus an additive migration to change.
- Topic tags (5א) → **decided:** stage tag only; no approved topic list exists, and a closed list is a
  content decision. Topics arrive by additive migration once a list is approved.
- Last audience choice on the device, not the account → **assumed:** no schema, no new personal data.
- Post rate limit → **assumed:** none in F3.1; abuse handling arrives with I4.

**Size estimate**  ~950 lines with tests: **split.** F3.1a (server: schemas, route/service/repository,
error mapping; criteria 1–5, 7–13) ~430 lines, Elevated. Criterion 6's CHECK migration ships first in a
schema-only PR (P6). F3.1b (web: criteria 14–18) ~470 lines, Elevated, depends on a.

**Gate 1 (ORCHESTRATOR, 18.10.2026):** approved. Split F3.1a → F3.1b accepted. Criterion 6 CHECK folds into the
not-yet-merged F3.0b migration (P6 schema PR). Edit of a reported post → Afik question 5, default applies.
