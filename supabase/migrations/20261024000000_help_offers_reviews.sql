-- =====================================================================================================================
-- Offer Help on any visible post, reviews one per parent and editable, review report reasons — I11 completion C, migration only.
--
-- SRS: FR-SERV-005, FR-SERV-008, FR-SERV-011 · BR-008, BR-009, BR-072, BR-074 · VAL-010, VAL-048 · AC-014, AC-093, AC-150 · FR-MOD-001 ·
--      OP-010, OP-038, OP-049 · decisions-in-force.md §13.1-13.3 (Afik 24.10.2026: Offer Help on every post the Professional may see, no
--      help-request marking, 100 a day), §11.21 (one review per parent per Professional, editable by its writer), §11.10 (the reviewed
--      Professional reports a review with its own four reasons).
--
-- outreach_requests      outreach_requests_insert_professional no longer asks the post to be marked as asking for help: an active
--                        Professional offers help on any active, non-share post it can read under its own posts RLS (so never a
--                        Friends-only post of someone else, never a post in a Private Group it is not a member of, never one it hid or
--                        reported), named or anonymous, loss posts included, when the post's author is a Regular (a named post: the author
--                        has no professional_profiles row: staff never post (posts_insert_author) and an account's type never changes, so a
--                        post author without a Professional profile is a Regular; the caller cannot read users.account_type of another
--                        account, and no new SECURITY DEFINER is added for it; an anonymous post is Regular-only, AC-130) and no user
--                        block stands between
--                        them. One per post stays (outreach_requests_professional_post_key). outreach_requests_insert_limit(): 100 in 24
--                        hours (was 10; NS029).
-- posts.is_help_request  INERT from here: no policy of outreach_requests reads it. The column, its check, its index, its grants and the
--                        edit-guard trigger column lists stay, because the code on main still reads and writes it until the I11-C code
--                        pull request lands; a follow-up migration drops them after that (contract phase; its down re-adds the column
--                        boolean not null default false). posts_insert_author / posts_update_author keep "a Professional's post is never
--                        marked" so the inert column stays consistent until then.
-- professional_reviews   One review per parent per Professional (professional_reviews_reviewer_professional_key), not per conversation.
--                        Data step ⭐ (brief I11-C (d) 5): duplicates per (reviewer, Professional) keep the newest (created_at, then id)
--                        and the older ones are deleted (their open reports expire through reports_target_gone; the down script cannot
--                        restore them). The writer edits rating and text of its own active (unmoderated) review while a conversation of
--                        context professional or outreach exists in which the Professional wrote (professional_reviews_update_reviewer;
--                        UPDATE (rating, body) granted); edited_at is the database clock of the last edit (NULL = never edited), set by
--                        professional_reviews_update_guard(), which also refuses a rating or text change by anyone but the writer (staff
--                        included: they moderate, never edit). The writer deletes its own active review (professional_reviews_delete_reviewer,
--                        ⭐ WORKPLAN "ממתין לך" 10; not a hidden or removed one, so a staff decision is not evaded); its open reports
--                        expire (§11.11: no record).
-- report_reasons         gain scope: 'community' (every reason so far, and every reason COMMUNITY_CONFIG adds) or 'reviewed_professional'
--                        (the four reasons of §11.10: פוגענית · שקרית / בלי אינטראקציה · מידע אישי · אחר; core, so always active).
--                        Priorities ⭐ (brief (a) 8): offensive and personal information 2, false and other 4.
-- reports                reports_insert_check(): a 'reviewed_professional' reason is only for the reviewed Professional reporting a review
--                        about itself; everyone else, and every other target, uses a 'community' one (23514). Transition (expand phase):
--                        the reviewed Professional may still use a community reason too, because the code on main sends one until the
--                        I11-C code pull request lands; the follow-up contract migration (with the is_help_request drop and the 500
--                        details cap) tightens it to the review reasons only. "אחר" of the review list needs a text, as "other" does
--                        (reports_other_details_check).
--
-- Not here: reports_details_length_check stays 1,000. The code on main still accepts up to 1,000 characters (REPORT_DETAILS_MAX, and
-- main's server tests send 1,000), so 500 in the database now would break main; it moves to 500 with the follow-up migration, after the
-- code that holds 500 is on main.
--
-- No new table, no new SECURITY DEFINER, no change to audit_trigger(). New SECURITY INVOKER trigger function:
-- professional_reviews_update_guard().
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261024000000_help_offers_reviews.down.sql (refuses while a report uses a review reason or an Offer Help exists on a post not
-- marked as asking for help; drops the edit clock; cannot restore the duplicate reviews the data step deleted).
-- =====================================================================================================================

-- 1. Offer Help on any post the Professional may read (§13.1-13.3) -------------------------------------------------------------
drop policy outreach_requests_insert_professional on nestly.outreach_requests;
create policy outreach_requests_insert_professional on nestly.outreach_requests
  for insert to authenticated
  with check ((select nestly.is_active_account()) and professional_id = (select auth.uid()) and professional_status = 'active'
    and status = 'pending' and (select nestly.caller_account_type()) = 'professional'
    and exists (select 1 from nestly.posts p where p.id = outreach_requests.post_id
                 and p.status = 'active' and not p.is_share
                 and (p.author_id is null
                   or (p.author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
                       and not exists (select 1 from nestly.professional_profiles pp where pp.user_id = p.author_id)))));

-- 100 a day (was 10). The rest is the text of 20261022400000.
create or replace function nestly.outreach_requests_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'outreach_requests: the daily limit needs a read committed transaction' using errcode = '25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8111, pg_catalog.hashtext(new.professional_id::text));
  if (select pg_catalog.count(*) from nestly.outreach_requests o
       where o.professional_id = new.professional_id and o.created_at > pg_catalog.now() - interval '24 hours') >= 100 then
    raise exception 'outreach_requests: too many Offer Help requests in 24 hours' using errcode = 'NS029';
  end if;
  return new;
end
$$;

-- 2. Reviews: one per parent per Professional, editable, deletable by the writer (§11.21) ------------------------------------------
-- Data step ⭐: keep the newest review of each (reviewer, Professional) pair. FORCE RLS holds the owner to the client policies, which show
-- it nothing (no auth.uid()): lifted for this one statement and put back at once. The deletes run as the owner, so content_staff_delete()
-- passes them; reports on a deleted review are set to NULL by the FK and expire (reports_target_gone).
alter table nestly.professional_reviews no force row level security;
do $$
begin
  raise notice 'I11-C data step: % duplicate review(s) per (reviewer, Professional) will be deleted, the newest of each pair kept',
    (select pg_catalog.count(*) from (select pg_catalog.row_number() over (partition by reviewer_id, professional_id order by created_at desc, id desc) as n
                                        from nestly.professional_reviews) d where d.n > 1);
end
$$;
delete from nestly.professional_reviews r
 using (select id, row_number() over (partition by reviewer_id, professional_id order by created_at desc, id desc) as n
          from nestly.professional_reviews) d
 where d.id = r.id and d.n > 1;
alter table nestly.professional_reviews force row level security;

alter table nestly.professional_reviews
  add constraint professional_reviews_reviewer_professional_key unique (reviewer_id, professional_id),
  add column edited_at timestamptz;

grant select (edited_at), update (rating, body) on table nestly.professional_reviews to authenticated;

-- The writer's edit: rating and text only (the grant), the clock is the database's; nobody else changes them (staff moderate, never edit).
-- A cascade (the reviewer's status) or the owner role is no edit.
create function nestly.professional_reviews_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.rating, new.body) is not distinct from (old.rating, old.body) or current_user <> 'authenticated' then
    return new;
  end if;
  if (select auth.uid()) is distinct from old.reviewer_id then
    raise exception 'professional_reviews: only its writer edits a review' using errcode = '42501';
  end if;
  new.edited_at := pg_catalog.now();
  return new;
end
$$;

revoke execute on function nestly.professional_reviews_update_guard() from public;

create trigger professional_reviews_update_guard
  before update of rating, body on nestly.professional_reviews
  for each row execute function nestly.professional_reviews_update_guard();

create policy professional_reviews_update_reviewer on nestly.professional_reviews
  for update to authenticated
  using ((select nestly.is_active_account()) and reviewer_id = (select auth.uid()) and moderation = 'active')
  with check ((select nestly.is_active_account()) and reviewer_id = (select auth.uid()) and reviewer_status = 'active'
    and moderation = 'active' and (select nestly.caller_account_type()) = 'regular'
    and exists (select 1 from nestly.conversations c where c.id = professional_reviews.conversation_id
                 and c.context in ('professional', 'outreach')
                 and professional_reviews.professional_id in (c.user_a, c.user_b)
                 and exists (select 1 from nestly.messages m
                              where m.conversation_id = c.id and m.sender_id = professional_reviews.professional_id)));

create policy professional_reviews_delete_reviewer on nestly.professional_reviews
  for delete to authenticated
  using ((select nestly.is_active_account()) and reviewer_id = (select auth.uid()) and moderation = 'active');

-- 3. Review report reasons (§11.10) ---------------------------------------------------------------------------------------------
alter table nestly.report_reasons
  add column scope text not null default 'community'
    constraint report_reasons_scope_check check (scope in ('community', 'reviewed_professional'));

-- FORCE lifted for the one insert, in this transaction (no client policy lets the owner write; the audit trigger records no owner row).
alter table nestly.report_reasons no force row level security;
insert into nestly.report_reasons (key, label, priority, sort_order, is_core, scope) values
  ('review_offensive',     'פוגענית',                  2, 110, true, 'reviewed_professional'),
  ('review_false',         'שקרית / בלי אינטראקציה',   4, 120, true, 'reviewed_professional'),
  ('review_personal_info', 'מידע אישי',                2, 130, true, 'reviewed_professional'),
  ('review_other',         'אחר',                      4, 140, true, 'reviewed_professional');
alter table nestly.report_reasons force row level security;

alter table nestly.reports drop constraint reports_other_details_check;
alter table nestly.reports add constraint reports_other_details_check
  check (reason not in ('other', 'review_other') or details is not null);

-- The text of 20261022700000, plus the reason's scope at the end.
create or replace function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
  v_about_me boolean := false;
begin
  if new.post_id is not null then
    -- a readable post that is not the reporter's own; absent and unreadable look the same (no oracle)
    select p.author_id into target from nestly.posts p where p.id = new.post_id;
    if not found
       or target.author_id = uid
       or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = uid) then
      raise exception 'reports: the post cannot be reported' using errcode = '42501';
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id into target from nestly.comments c where c.id = new.comment_id;
    if not found
       or target.author_id = uid
       or (target.author_id is null
           and exists (select 1 from nestly.post_authors pa where pa.post_id = target.post_id and pa.author_id = uid)) then
      raise exception 'reports: the comment cannot be reported' using errcode = '42501';
    end if;
  elsif new.message_id is not null then
    -- the reporter's own read of the message (a party only); its text is not copied (reports_insert_snapshot copies posts and comments only)
    select m.sender_id into target from nestly.messages m where m.id = new.message_id;
    if not found or target.sender_id = uid then
      raise exception 'reports: the message cannot be reported' using errcode = '42501';
    end if;
  elsif new.listing_id is not null then
    -- the reporter's own read of the listing (FR-MKT-001); absent, hidden, expired and unreadable look the same
    select l.owner_id into target from nestly.marketplace_listings l where l.id = new.listing_id;
    if not found or target.owner_id = uid then
      raise exception 'reports: the listing cannot be reported' using errcode = '42501';
    end if;
  elsif new.review_id is not null then
    -- I11 follow-ups: a review the reporter can read (an active, unmoderated review); its writer is never readable, so its own is allowed
    select r.professional_id into target from nestly.professional_reviews r where r.id = new.review_id;
    if not found then
      raise exception 'reports: the review cannot be reported' using errcode = '42501';
    end if;
    v_about_me := target.professional_id = uid;
  elsif new.article_id is not null then
    -- I11 follow-ups: an article the reporter can read that is not its own
    select a.author_id into target from nestly.professional_articles a where a.id = new.article_id;
    if not found or target.author_id = uid then
      raise exception 'reports: the article cannot be reported' using errcode = '42501';
    end if;
  elsif new.target_kind = 'listing' then
    raise exception 'reports: a listing report names its listing' using errcode = '23514';
  end if;
  -- I11 completion C (§11.10): the review reasons are only for the reviewed Professional on a review about itself; every other report uses
  -- the community ones. Transition: the reviewed Professional may still use a community reason (main's code sends one); the follow-up
  -- contract migration allows it the review reasons only. An unknown reason is left to the foreign key.
  if not v_about_me and exists (select 1 from nestly.report_reasons rr where rr.key = new.reason and rr.scope <> 'community') then
    raise exception 'reports: this reason does not apply to this report' using errcode = '23514';
  end if;
  return new;
end
$$;

-- 4. Comments ---------------------------------------------------------------------------------------------------------------
comment on policy outreach_requests_insert_professional on nestly.outreach_requests is
  'An active Professional offers help on an active, non-share post it can read (its own posts RLS: no Friends-only post of another, no Private Group it is not in) whose author is a Regular, named or anonymous, never across a user block with a named author (FR-SERV-005, VAL-010, §13.1-13.3); one per post (key) and 100 a day (NS029).';
comment on function nestly.outreach_requests_insert_limit() is 'BEFORE INSERT, SECURITY INVOKER. At most 100 Offer Help requests per Professional in 24 hours, every status counted (NS029, AC-014 (b), §13.3); read committed only; per-Professional advisory lock 8111.';
comment on column nestly.posts.is_help_request is 'Inert since 20261024000000 (§13.1: no help-request marking; Offer Help no longer reads it). Dropped by a follow-up migration once the code no longer reads or writes it.';
comment on table nestly.professional_reviews is
  'SRS ProfessionalReview (§13, FR-SERV-011, BR-072, AC-093): a Regular''s 1-5 rating and text of a Professional, one per parent and Professional (§11.21), after a professional or outreach conversation in which the Professional wrote. The writer edits rating and text and deletes it. Read by every active account; the reviewer is never granted for SELECT.';
comment on column nestly.professional_reviews.conversation_id is 'The conversation the review rests on (the "approved request", OP-049). Not readable (no SELECT grant): joined to the conversation it would name the reviewer.';
comment on column nestly.professional_reviews.edited_at is 'When the writer last changed rating or text (professional_reviews_update_guard, the database clock); NULL = never edited. UTC.';
comment on constraint professional_reviews_reviewer_professional_key on nestly.professional_reviews is 'One review per parent per Professional (§11.21, OP-049); a second is an edit of the first.';
comment on function nestly.professional_reviews_update_guard() is 'BEFORE UPDATE OF rating, body, SECURITY INVOKER. Only the writer changes rating or text (42501; staff never edit); edited_at is the database clock. The owner role and cascades pass.';
comment on policy professional_reviews_update_reviewer on nestly.professional_reviews is 'The writer edits its own unmoderated review while the conversation the review rests on, in which the Professional wrote, exists (§11.21, FR-SERV-011).';
comment on policy professional_reviews_delete_reviewer on nestly.professional_reviews is 'The writer deletes its own active review (⭐ WORKPLAN 10; not one hidden or removed by staff); its open reports expire (reports_target_gone, §11.11).';
comment on column nestly.report_reasons.scope is 'community: the reasons of every report (and every reason COMMUNITY_CONFIG adds); reviewed_professional: the four reasons the reviewed Professional uses on a review about itself (§11.10).';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post, comment, chat message, listing, review or article must be readable to the reporter and (but a review, whose writer is never readable) not their own (42501); for a post or comment named or through post_authors. A reviewed_professional reason only for the reviewed Professional on a review about itself (23514, §11.10); it may still use a community one until the follow-up migration.';
comment on constraint reports_other_details_check on nestly.reports is '"other" and the review list''s "אחר" need a text (VAL-048).';
