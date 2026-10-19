# professional-posting (I3) — a Professional writes community posts, never anonymously

**Amendment 19.10:** A&D step 5b (c6 per R2 + new c14, c7 R5 pgTAP, c4 as an ordering fixture); Afik DR-2 correction
("everyone"/"followers only", I3 "everyone" only); DR-1, DR-3 final as ⭐.

**Problem**        A Professional cannot write a community post: the DB refuses it (posts.author_id → regular_profiles,
23503 → 403) and the web shows a placeholder. Afik 19.10 (item 15): a Professional may post, never anonymously.
**Requirements**   FR-FEED-002 (05-functional/feed.md, Actor "Regular/Professional") · FR-FEED-005 + AC-076 (15-acceptance.md)
· FR-FEED-001, FR-FEED-003 (Actor includes Professional) · AC-061 · FR-ALG-002 · Afik 3א · decisions/2026-10.md 19.10
"Composer and Professional posting", "Professional audience" · `algorithm-review.md` R1–R6 (binding) · amends F3.1 c4,
c14, F3.2 c12, c13, feed-composer c1, c11.
**SRS check (srs-lookup):** FR-FEED-001/003 give Professionals the feed, comments, likes (I3 had deferred them; DR-1
brings them in). No edit/delete FR; F3.1's rules (FR-FEED-002 + 3א) do not depend on account type, so they apply.
**Scope**          Schema (DATA ARCHITECT, own PR first, P6) · server: the content ranking profile (R2) and the end of
the feed's Professional refusal · web: Professional composer on /feed (always-open field, no toggle, no audience or
tag group), own post edit/delete, feed, comments, likes.
**Out of scope**   The I11 card tag "יועץ · <תחום>" (wording and gender-neutral form: I11's SPEC) · a Professional name
or profile · Professional registration · "followers only" and Follow (I11) · Offer Help · AC-061's profession/groups/
follows signals, a `professional_feed` surface (I11, FR-ALG-003) · promotions · Professional shares, hides, reports
(F3.5/F3.7/F3.9; `20261019200000_feed_i3_rest.sql` 37, 67 refuse them today) · Groups · Admin/Moderator posting ·
events (R6) · the word "בעל מקצוע" in any user copy.
**Data touched**   posts (insert/update/delete by a Professional author), post_authors (stays Regular-only); reads of
posts, comments, reactions, regular_names by a Professional; comments/reactions writes by a Professional.
**Risk flags**     auth/authz · schema migration · personal data → **Elevated** + ALGORITHM & DATA (done, R1–R6).

**Schema needs** (DATA ARCHITECT designs; no SQL here)
- N1 `posts.author_id` accepts an active Professional (today 23503). `post_authors.author_id` stays Regular-only, plus
  an explicit refusal of `is_anonymous` for a non-Regular author. AC-076 and F3.4 c3 stay true.
- N2 The insert path (`posts_insert_prepare`, `posts_insert_author`) admits an active Professional's named post and
  refuses, for that author, `is_anonymous`, any audience but `everyone`, a non-null `stage_tag` (D2). The audience
  domain may gain `followers` now if simple (Afik 19.10); in I3 `followers` is refused for every author. Admin/
  Moderator and stopped accounts stay refused. Update keeps these rules; `delete_post(uuid)` works for the author (3א).
- N3 Whatever hides a stopped author's posts (`author_status`) works the same for a Professional author.
- N4 Posts, comments, reactions and regular_names read policies admit an active Professional viewer exactly as a
  Regular non-friend (data-model rule 5); `friendships` policies are not extended (R1). `comments.author_id`,
  `reaction_owners.user_id`, `comments_insert_prepare`, `reactions_insert_prepare` admit a Professional and keep the
  `author_id = uid` comparison behind `is_by_author` / `is_by_post_author` (R5). "המחבר" logic unchanged.

**Decisions (unreserved; reasons)**
- D1 The web treats `GET /api/profile` 404 `no_profile` as "Professional composer" (no account-type signal exists).
- D2 No stage tag for a Professional: the labels are a parent's first person ("יש לנו ילד או ילדה"); enforced in the DB.
- D3 Composer and edit form show the fixed line "הפוסט יוצג לכולם" instead of an audience group (one option in I3); no
  name notice, since no name is shown (DR-3). Shared Zod `audience` stays `everyone|friends` in I3.

**Acceptance criteria** (U unit · I integration, real DB under RLS · P pgTAP · E e2e)
1. 🔴 [P] An active Professional inserts a named `everyone` post, stage_tag null: one row, author_id = caller. Refused,
   0 rows: is_anonymous (0 post_authors), `friends`, `followers` (if the value exists; also for a Regular), a stage_tag,
   a suspended Professional, Admin, Moderator. Regular inserts unchanged (F3.0 tests pass).
2. 🔴 [I] `POST /posts {body, audience:"everyone"}` by an active Professional → 201 `isAnonymous:false`.
   `isAnonymous:true` → 403 `not_allowed`, 0 posts, 0 post_authors (AC-076). `audience:"friends"` or a `stageTag` → 403,
   no row; `"followers"` → 400 (Zod). No response carries an author id (amends F3.1 c4).
3. 🔴 [I] Professional author: `PATCH` body → 200; `audience:"friends"` or a `stageTag` → 403, unchanged; `DELETE` → 204,
   also with an open report; another user's PATCH/DELETE → 404. `GET /posts/:id`: `isMine` true only for the author.
4. 🔴 [I] Ordering fixture (R4): with `wFriend` > 0 and `wStage` > 0, a Regular viewer with a Stage and friends sees a
   Professional's `everyone` post at exactly the position of a Regular non-friend's untagged post with the same age and
   `n`; it is a named unit, `author.name` null, `isMine` false. A stopped Professional's posts are absent for everyone.
5. 🔴 [U] Static: no repository or service reads `account_type` to allow or refuse a post, comment or like write, and
   no feed SQL filters on it (R1); the only read is `classifyViewer` choosing the profile.
6. 🔴 [I] R2, real DB: `GET /feed` by an active Professional → 200 with own and `everyone` posts (F3.2 c1 set for a
   non-friend). Pinned config `wFriend` = 2, `wStage` = 2, stage-tagged Regular posts: (a) ids and order equal the
   content-only order of the shared reference (`scorePost` content profile); (b) `readOwnStages` spy: 0 calls;
   (c) at `wStage` = 0, a Professional and a Regular with no friends and no journey see identical ids and order at one
   `asOf`. Suspended → 403 `account_unavailable`; Admin/Moderator → 403 `not_allowed` (amends F3.2 c12).
7. 🔴 [P+I] R5: a Professional comments, replies and likes on a readable post → 201/204 as F3.3 and counts in `n`; on
   their own post the rows carry `is_by_author` / `is_by_post_author` = true and stay out of `n`; once suspended, their
   likes and comments leave `n`. Their comment has `author.name` null; F3.3 refusals unchanged.
8. 🎨 [E] Professional on /feed (375, 1024): the always-open form "כתיבת פוסט" (feed-composer c1-c2) with "מה תרצו
   לשתף?", the line "הפוסט יוצג לכולם", "פרסום". No "פרסום אנונימי", audience group, tag group or name notice in the
   DOM, at any time (amends feed-composer c1).
9. 🎨 [E] Publishing: payload exactly `{body, audience:"everyone", stageTag:null}` (no `isAnonymous`); new card first,
   header "מהקהילה", "כולם", status "הפוסט פורסם", focus on it. Failure: as feed-composer c10.
10. 🎨 [E] /posts/new for a Professional → /feed with focus in the textbox (amends feed-composer c11).
11. 🎨 [E] Own post page: "עריכה", "מחיקה"; the edit form shows "הפוסט יוצג לכולם", no audience or tag group; save
    shows the update; delete as F3.1 c18.
12. 🎨 [E] The Professional sees the feed (no placeholder), "לייק" and "תגובות" on cards, and the comment composer
    without the Q7 name notice (amends F3.2 c13).
13. 🎨 [E] axe 0 at 375 and 1024; visual baselines: Professional composer idle and engaged, own post edit form. No
    user-visible "בעל מקצוע" (grep of the diff). "פרסום" ≥ 44×44 px.
14. 🟡 [U] R2 static (algorithm-review.md "Static-test wording", binding): the content profile's rendered ranking SQL,
    with `wFriend`, `wStage` > 0 and stages given, holds none of `friendships`, `journey_contexts`, `children`,
    `stage_tag`, `auth.uid`, and no array parameter; the Regular profile's SQL equals F3.2's byte for byte. Profile
    selection: `content` → stage read false for any `wStage`; `journeys-repository` reaches `feed-service.ts` only via
    the one `readOwnStages` call inside the Regular branch.

**Decided (Afik 19.10, final)** DR-1: Professionals read the feed, comment, reply and like in I3 on the content profile
(R2); I11 adds profession/groups/follows. DR-2: a Professional's options are "everyone" and "followers only", never
"friends"; I3 has "everyone" only; I11 builds "followers only" (SRS-changes row 6f). DR-3: "מהקהילה", no name notice;
I11 adds the name and "יועץ · <תחום>" before Professional registration opens (I3 exposure: fixtures only,
`20261014200000_registration_account.sql` 87).

**Size estimate**  a = schema PR (DATA ARCHITECT, N1–N4, pgTAP c1, c7) · b = server ~60 + web ~120 product lines,
~600 test lines (c2–c14), after a and after feed-composer merges. Elevated, two PRs.
