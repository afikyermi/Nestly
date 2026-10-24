-- =====================================================================================================================
-- Down script for supabase/migrations/20261024000000_help_offers_reviews.sql (I11 completion C: Offer Help on any visible post, 100 a
-- day; reviews one per parent and editable; the review report reasons). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while no report uses one of the four review reasons (the reasons cannot go while a report names one) and no Offer
--           Help exists on a post not marked as asking for help (the restored policy would not have admitted it); refuses otherwise. Drops the edit clock of the reviews (edited_at). CANNOT restore the duplicate reviews per (reviewer, Professional) that
--           the up's data step deleted.
-- Restores: outreach_requests_insert_professional and outreach_requests_insert_limit() (10 a day) and reports_insert_check() as
--           20261022400000 / 20261022700000 wrote them, reports_other_details_check, the comments; drops what the migration added; the
--           history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the help offers and reviews down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only.
  alter table nestly.reports no force row level security;
  if exists (select 1 from nestly.reports where reason in ('review_offensive', 'review_false', 'review_personal_info', 'review_other')) then
    raise exception 'a report uses a review reason: the down script refuses';
  end if;
  alter table nestly.reports force row level security;
  alter table nestly.outreach_requests no force row level security;
  alter table nestly.posts no force row level security;
  if exists (select 1 from nestly.outreach_requests o join nestly.posts p on p.id = o.post_id where not p.is_help_request) then
    raise exception 'an Offer Help exists on a post not marked as asking for help: the down script refuses';
  end if;
  alter table nestly.posts force row level security;
  alter table nestly.outreach_requests force row level security;
end
$$;

-- reports: the reason check, the reasons and their scope
create or replace function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
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
    if not exists (select 1 from nestly.professional_reviews r where r.id = new.review_id) then
      raise exception 'reports: the review cannot be reported' using errcode = '42501';
    end if;
  elsif new.article_id is not null then
    -- I11 follow-ups: an article the reporter can read that is not its own
    select a.author_id into target from nestly.professional_articles a where a.id = new.article_id;
    if not found or target.author_id = uid then
      raise exception 'reports: the article cannot be reported' using errcode = '42501';
    end if;
  elsif new.target_kind = 'listing' then
    raise exception 'reports: a listing report names its listing' using errcode = '23514';
  end if;
  return new;
end
$$;

alter table nestly.reports drop constraint reports_other_details_check;
alter table nestly.reports add constraint reports_other_details_check check (reason <> 'other' or details is not null);

alter table nestly.report_reasons no force row level security;
delete from nestly.report_reasons where key in ('review_offensive', 'review_false', 'review_personal_info', 'review_other');
alter table nestly.report_reasons force row level security;
alter table nestly.report_reasons drop column scope;

-- professional_reviews: the writer's edit and delete, the edit clock, the pair key
drop policy professional_reviews_delete_reviewer on nestly.professional_reviews;
drop policy professional_reviews_update_reviewer on nestly.professional_reviews;
drop trigger professional_reviews_update_guard on nestly.professional_reviews;
drop function nestly.professional_reviews_update_guard();
revoke update (rating, body) on table nestly.professional_reviews from authenticated;
alter table nestly.professional_reviews
  drop column edited_at,
  drop constraint professional_reviews_reviewer_professional_key;

-- outreach_requests: Offer Help only on a post that asks for help, 10 a day
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
       where o.professional_id = new.professional_id and o.created_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'outreach_requests: too many Offer Help requests in 24 hours' using errcode = 'NS029';
  end if;
  return new;
end
$$;

drop policy outreach_requests_insert_professional on nestly.outreach_requests;
create policy outreach_requests_insert_professional on nestly.outreach_requests
  for insert to authenticated
  with check ((select nestly.is_active_account()) and professional_id = (select auth.uid()) and professional_status = 'active'
    and status = 'pending' and (select nestly.caller_account_type()) = 'professional'
    and exists (select 1 from nestly.posts p where p.id = outreach_requests.post_id
                 and p.status = 'active' and p.is_help_request and not p.is_share
                 and (p.author_id is null or p.author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

comment on policy outreach_requests_insert_professional on nestly.outreach_requests is 'An active Professional offers help on an active, readable post that asks for help (VAL-010); one per post (key) and 10 a day (NS029).';
comment on function nestly.outreach_requests_insert_limit() is 'BEFORE INSERT, SECURITY INVOKER. At most 10 Offer Help requests per Professional in 24 hours, every status counted (NS029, AC-014 (b)); read committed only; per-Professional advisory lock 8111.';
comment on column nestly.posts.is_help_request is 'OP-038 (default ⭐ (a), I11): the author marked the post as asking for help, so Professionals may Offer Help (FR-SERV-005). Regular posts only (posts_insert_author); never a share.';
comment on column nestly.professional_reviews.conversation_id is 'The conversation the review rests on: one review per conversation (the "approved request", OP-049). Not readable (no SELECT grant): joined to the conversation it would name the reviewer.';
comment on table nestly.professional_reviews is
  'SRS ProfessionalReview (§13, FR-SERV-011, BR-072, AC-093): a Regular''s 1-5 rating and text of a Professional, once per professional conversation in which the Professional wrote (OP-049 default). Immutable. Read by every active account; the reviewer is never granted for SELECT.';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post, comment, chat message, listing, review or article must be readable to the reporter and (but a review, whose writer is never readable) not their own (42501); for a post or comment named or through post_authors.';
comment on constraint reports_other_details_check on nestly.reports is null;

delete from supabase_migrations.schema_migrations where version = '20261024000000';

commit;
