# professional-posting (I3) — a Professional writes community posts, never anonymously

**Problem**        A Professional account cannot write a community post: the database refuses it (posts.author_id →
regular_profiles, 23503 → 403) and the web shows the Professional a placeholder with no composer. Afik decided on
19.10 (item 15, decisions/2026-10.md "Composer and Professional posting") that a Professional may post, never anonymously.
**Requirements**   FR-FEED-002 (05-functional/feed.md, Actor "Regular/Professional") · FR-FEED-005 + AC-076 (15-acceptance.md:
"Professional אינו יכול לפרסם פוסט אנונימי") · FR-FEED-001 (Actor "Regular User / Professional User") · FR-FEED-003
(Actor "Regular/Professional") · AC-061 (Professional Feed without Child/Journey data) · Afik 3א (edit/delete apply to
any author) · amends F3.1 c4, c14, F3.2 c12, c13, feed-composer c1, c11 (Professional halves).
**SRS check (srs-lookup):** the SRS does give Professionals the feed (FR-FEED-001), comments and likes (FR-FEED-003).
I3 deferred all three to I11 (F3.2 out of scope); Afik's 19.10 decision covers posting only → DR-1. The SRS has no
edit/delete FR; F3.1 took them from FR-FEED-002 + 3א, which do not depend on account type, so they are included.
**Scope**          Schema (DATA ARCHITECT, own PR first, P6) · server: nothing beyond what the schema decides, plus
the feed's account-type refusal if DR-1 is approved · web: a Professional composer on /feed (always-open field as
feed-composer, no anonymous toggle, no audience or tag group), own post page edit/delete, and (DR-1) feed, comments, likes.
**Out of scope**   The I11 card tag "יועץ · <תחום>" (wording and gender-neutral form are I11's SPEC) · any Professional
name or profile (none exists before I11) · Professional registration (still Regular-only) · a followers audience ·
Offer Help · AC-061's profession/groups/follows signals · promotions · Professional shares, hides, reports
(F3.5/F3.7/F3.9 own their gates; `20261019200000_feed_i3_rest.sql` 37, 67 refuse Professionals today) · Groups ·
Admin/Moderator posting (stays refused) · the word "בעל מקצוע" anywhere in user copy.
**Data touched**   posts (insert, update, delete by a Professional author), post_authors (must stay Regular-only);
with DR-1: reads of posts, comments, reactions, regular_names by a Professional, and comments/reactions writes.
**Risk flags**     auth/authz · schema migration · personal data (post text) → **Elevated** (+ ALGORITHM & DATA if DR-1).

**Schema needs** (DATA ARCHITECT designs; no SQL here)
- N1 `posts.author_id` accepts an active Professional's id (today the FK to regular_profiles refuses, 23503).
  `post_authors.author_id` stays Regular-only, plus an explicit refusal of `is_anonymous` for a non-Regular author
  (not only the FK error). AC-076 and F3.4 c3 stay true (403, 0 posts, 0 post_authors).
- N2 `posts_insert_prepare` and the insert policy (`posts_insert_author` WITH CHECK) admit an active Professional's
  named post. For a Professional author they refuse `is_anonymous`, `audience = 'friends'` (DR-2) and a non-null
  `stage_tag` (D2). Admin/Moderator and stopped accounts stay refused. The update policy keeps the same audience/tag
  rules, and `delete_post(uuid)` works for the Professional author (3א, open report included).
- N3 Whatever hides a stopped author's posts (`author_status`) works the same for a Professional author.
- N4 (only if DR-1 is approved) the posts, comments, reactions and regular_names read policies admit an active
  Professional viewer exactly as a Regular non-friend (data-model rule 5). `comments.author_id`, `reaction_owners.user_id`,
  `comments_insert_prepare` and `reactions_insert_prepare` admit a Professional. "המחבר" logic unchanged.

**Decisions (unreserved; reasons)**
- D1 The web treats `GET /api/profile` 404 `no_profile` as "Professional composer". No account-type signal exists
  (F3.1b note). The database refuses Admin/Moderator anyway.
- D2 No stage tag for a Professional. The labels are a parent's first person ("יש לנו ילד או ילדה"); on a
  Professional's post they would say something false. Enforced in the DB (N2), not only hidden.
- D3 The Professional composer shows the fixed line "הפוסט יוצג לכולם" in place of the audience group (new text,
  ux-copy-he: neutral, impersonal). It shows no name notice, because no name is shown (DR-3).

**Acceptance criteria** (U unit · I integration, real DB under RLS · P pgTAP · E e2e)
1. 🔴 [P] An active Professional inserts a named post (`everyone`, stage_tag null): one row, author_id = caller.
   Refused, 0 rows: is_anonymous (and 0 post_authors), `friends`, a stage_tag, a suspended Professional, Admin,
   Moderator. A Regular's inserts are unchanged (F3.0 tests pass).
2. 🔴 [I] `POST /posts {body, audience:"everyone"}` by an active Professional → 201 `isAnonymous:false`.
   `isAnonymous:true` → 403 `not_allowed`, 0 posts, 0 post_authors (AC-076). `audience:"friends"` or a `stageTag` → 403,
   no row. No response carries an author id (amends F3.1 c4).
3. 🔴 [I] Professional author: `PATCH` body → 200; `audience:"friends"` or a `stageTag` → 403, row unchanged; `DELETE` →
   204, also with an open report; another user's PATCH/DELETE on it → 404. `GET /posts/:id`: `isMine` true only for them.
4. 🔴 [I] A Regular's feed and `GET /posts/:id` show a Professional's `everyone` post as a named unit with `author.name`
   null, `isMine` false, Friend term 0. A stopped Professional's posts are absent for everyone.
5. 🔴 [U] Static: no repository or service reads `account_type` to allow or refuse a post write; refusals come from the DB.
6. 🔴 [I, DR-1] `GET /feed` by an active Professional → 200: `everyone` posts and own posts, as for a Regular non-friend
   (F3.2 c1 set), no `journey_contexts` or `friendships`-derived term (AC-061), no Stage read; suspended → 403
   `account_unavailable`. Admin/Moderator still 403 `not_allowed` (amends F3.2 c12).
7. 🔴 [I, DR-1] A Professional comments, replies and likes on a readable post, and on their own post: 201/204 as F3.3.
   Their comment carries `author.name` null; F3.3's refusals (held, unreadable, stopped) are unchanged.
8. 🎨 [E] Professional on /feed (375 and 1024): the always-open form "כתיבת פוסט" (feed-composer c1-c2) with
   "מה תרצו לשתף?", the line "הפוסט יוצג לכולם" and "פרסום". No "פרסום אנונימי", audience group, tag group or name
   notice in the DOM, at any time (amends feed-composer c1).
9. 🎨 [E] A Professional publishes: payload exactly `{body, audience:"everyone", stageTag:null}` (no `isAnonymous`); the
   new card is first with header "מהקהילה" and "כולם", status "הפוסט פורסם", focus on it. Failure: as feed-composer c10.
10. 🎨 [E] /posts/new for a Professional → /feed with focus in the textbox (amends feed-composer c11).
11. 🎨 [E] Own post page: "עריכה" and "מחיקה" shown; the edit form has the line "הפוסט יוצג לכולם", no audience or tag
    group; save shows the update; delete as F3.1 c18.
12. 🎨 [E, DR-1] The Professional sees the feed (no placeholder), "לייק" and "תגובות" on cards, and the comment composer
    without the Q7 name notice. Amends F3.2 c13.
13. 🎨 [E] axe 0 at 375 and 1024 and visual baselines for: Professional composer idle and engaged, own post edit
    form. No user-visible "בעל מקצוע" (grep of the diff). "פרסום" ≥ 44×44 px.

**Open — DECISION REQUESTs (Afik)**
- **DR-1 (scope; the SRS gives it, I3 deferred it):** in I3, does a Professional also read the community feed and
  comment, reply and like? ⭐ **Yes.** Feed ranking for them uses content signals only (Friend 0, Stage 0, no journey
  read; consistent with AC-061); I11 adds profession/groups/follows. Reason: a writer who cannot see replies on their
  own post has a broken loop, and Afik rejected "Professionals read-only". Alternative: posting only; the placeholder
  stays and own posts are seen only on `/posts/:id`. Criteria 6, 7, 12 and N4 depend on it.
- **DR-2 (FR-FEED-002 says every author picks an audience):** friendship is Regular-only (BR-029), so "חברים בלבד" by
  a Professional reaches no one but themselves. ⭐ **"כולם" only in I3**, enforced in the DB; a followers audience is
  decided in I11. This deviates from the FR-FEED-002 text → I3 "שינויים ל-SRS".
- **DR-3 (no Professional name exists before I11):** ⭐ **the existing fallback "מהקהילה"** on their posts and
  comments, with no name notice in their composer. I11 must add the name and "יועץ · <תחום>" before Professional
  registration opens (I11-commitments). Alternative: a "יועץ"-worded label now (form decided by I11's SPEC).
  Exposure in I3 is fixtures only: registration creates Regular accounts only (`20261014200000_registration_account.sql` 87).

**Size estimate**  a = schema PR (DATA ARCHITECT, N1-N4, pgTAP c1) · b = server ~30 + web ~120 product lines,
~500 test lines (c2-c13), after a and after feed-composer merges. Elevated, two PRs. Without DR-1: b ≈ 90 + 300.
