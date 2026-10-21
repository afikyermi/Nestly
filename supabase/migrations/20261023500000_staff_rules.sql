-- =====================================================================================================================
-- The staff's rules, second completion -- I14 completion B (Afik's decisions of 21.10.2026 (b), decisions-in-force.md §10.2-10.4, §10.7 and
-- §10 item 9), migration only.
--
-- SRS: FR-MOD-001/002/003, BR-074, BR-076, BR-080, BR-081, BR-082 (a justified report deletes the content; the enforcement history; more than ten
--      identical reports hide the content until a decision; every opening of a reported comment is audited), FR-PRIV-001 / BR-081 (staff see a
--      restricted profile in full, never tracker data), FR-ADMIN-008 / OP-042 (an announcement's audience), FR-ADMIN-015 / OP-056 (calendar periods,
--      rounded counts), NFR-MEDIA-001 / BR-076 (a perceptual hash of every image marked as suspected child abuse blocks the same image at upload)
--      · platform rules 6, 8, 10, 16-19 (.claude/knowledge/data-model.md).
--
-- enforcement_records      one row per justified decision on reported content (a post, comment, listing, review or article deleted by staff):
--                          type, rule (the report reason), date, decider, the author, at most 100 characters of the text (a listing: its title).
--                          Written by the deletion itself (content_staff_delete, as the staff member); USER_VIEW (the Admin always) reads them.
-- staff deletion           CONTENT_MODERATE (a listing: MARKETPLACE_MODERATE) deletes a post, comment, listing, review or article only in the
--                          transaction that closed a report on it as action_taken (*_delete_staff). The reports still open on a deleted post's
--                          comments, or on a deleted comment's replies, expire with them (reports_handle_guard, from that trigger only).
-- auto_hide_scopes         the nonce of one identical_reports_hide() call (the trend_scopes pattern): its scoped reads open only inside it.
-- report_auto_hides        ten or more different people reporting the same item for the same reason hide it from everyone else until a staff
--                          decision, at most 90 days (*_auto_hide RESTRICTIVE policies). The author and the people who reported it see no change
--                          (the hide row is not readable to them), staff see the item. Written by identical_reports_hide(): a NEW SECURITY
--                          DEFINER trigger function (rule 17: a count over other people's reports, a write no reporter's policy allows),
--                          approved by Afik 21.10.2026 (night; decisions-in-force.md §12). Released when the last open
--                          report on the item closes without the item being deleted (report_auto_hides_lift, as the staff member).
-- reported_comment_views   every opening of a reported comment by REPORTS_VIEW, audited (reported_comment_viewed), also after the report closed.
-- profile_staff_views      a staff member's opening of a Regular profile, audited (staff_profile_viewed): profile_view() shows that opening the
--                          full profile (the view a Friend sees), never tracker data. profile_view() replaced with that one change.
-- system_announcements     gain audience (everyone, parents, professionals, a stage) and audience_stage: a published announcement is read only by
--                          the accounts it addresses; a staff account reads "everyone" only (and SYSTEM_ANNOUNCEMENTS all of them, as before).
-- child_tracker_trends()   a new signature (the approved family, §9.2; the 30/90/365-day one stays until the code uses this, then a contract
--                          migration drops it): a calendar period (this or last week, this or last month, Israel time) instead of
--                          the last 30/90/365 days; the week and month splits dropped; the number of children rounded to the nearest 10 and the
--                          average to one decimal; a cell is still hidden on its true count (fewer than 10 children or 10 families).
-- media_fingerprints,     the job records each checked or suspected image's perceptual hash (media_fingerprints); the hash of every image marked
-- suspected_image_fingerprints  as suspected child abuse is the block list (hashes only, never an image; no client reads either). An upload whose hash is within 6 bits of a listed one is rejected (the
--                          same ERR-041 as any rejection) and held as a suspicion (M6, 90 days; queue reason hash_match), with no account action.
-- audit_trigger() replaced   the body of 20261022800000 plus content_deleted, reported_comment_viewed, staff_profile_viewed and the audience in the
--                            announcement's Before/After.
-- Phase: expand. Down script: supabase/rollback/20261023500000_staff_rules.down.sql.
-- =====================================================================================================================


-- 1. The enforcement history (FR-MOD-002, FR-MOD-003, §10.4) ---------------------------------------------------------------------
create table nestly.enforcement_records (
  id          uuid        not null default gen_random_uuid(),
  user_id     uuid,
  target_kind text        not null,
  target_id   uuid        not null,
  rule        text        not null,
  excerpt     text        not null,
  report_id   uuid,
  decided_by  uuid        not null default auth.uid(),
  decided_at  timestamptz not null default now(),
  constraint enforcement_records_pkey primary key (id),
  constraint enforcement_records_target_kind_check check (target_kind in ('post', 'comment', 'listing', 'review', 'article')),
  constraint enforcement_records_excerpt_check check (pg_catalog.char_length(excerpt) <= 100),
  constraint enforcement_records_target_key unique (target_kind, target_id),
  constraint enforcement_records_rule_fkey foreign key (rule) references nestly.report_reasons (key),
  constraint enforcement_records_user_id_fkey foreign key (user_id) references nestly.users (id) on delete restrict,
  constraint enforcement_records_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete set null,
  constraint enforcement_records_decided_by_fkey foreign key (decided_by) references nestly.users (id) on delete restrict
);

create index enforcement_records_user_id_idx on nestly.enforcement_records (user_id, decided_at desc) where user_id is not null;
create index enforcement_records_decided_by_idx on nestly.enforcement_records (decided_by);
create index enforcement_records_report_id_idx on nestly.enforcement_records (report_id) where report_id is not null;

alter table nestly.enforcement_records enable row level security, force row level security;

-- the staff's user management (PG-028): USER_VIEW (the Admin always)
create policy enforcement_records_select_staff on nestly.enforcement_records
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('USER_VIEW')));

-- written by the deletion of the content (content_staff_delete, as the staff member), in the transaction that closed a report on it as action_taken:
-- the record must name that report's item and reason, and the item's author and text as they are (the item still exists, BEFORE DELETE), so no
-- record can be made up for another account or another item. A review names no writer (FR-MOD-001: never identified, staff included).
create policy enforcement_records_insert_staff on nestly.enforcement_records
  for insert to authenticated
  with check ((select nestly.is_active_account()) and decided_by = (select auth.uid())
    and (case when target_kind = 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
              else (select nestly.has_permission('CONTENT_MODERATE')) end)
    and exists (select 1 from nestly.reports r
                 where r.id = enforcement_records.report_id and r.status = 'handled' and r.resolution = 'action_taken'
                   and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()
                   and r.target_kind = enforcement_records.target_kind and r.reason = enforcement_records.rule
                   and coalesce(r.post_id, r.comment_id, r.listing_id, r.review_id, r.article_id) = enforcement_records.target_id)
    and case target_kind
          when 'post' then exists (select 1 from nestly.posts p where p.id = enforcement_records.target_id
                                     and p.author_id is not distinct from enforcement_records.user_id
                                     and pg_catalog.left(coalesce(p.body, ''), 100) = enforcement_records.excerpt)
          when 'comment' then exists (select 1 from nestly.comments c where c.id = enforcement_records.target_id
                                        and c.author_id is not distinct from enforcement_records.user_id
                                        and pg_catalog.left(c.body, 100) = enforcement_records.excerpt)
          when 'listing' then exists (select 1 from nestly.marketplace_listings l where l.id = enforcement_records.target_id
                                        and l.owner_id = enforcement_records.user_id and pg_catalog.left(l.title, 100) = enforcement_records.excerpt)
          when 'review' then enforcement_records.user_id is null
                             and exists (select 1 from nestly.professional_reviews v where v.id = enforcement_records.target_id
                                           and pg_catalog.left(v.body, 100) = enforcement_records.excerpt)
          else exists (select 1 from nestly.professional_articles a where a.id = enforcement_records.target_id
                         and a.author_id = enforcement_records.user_id and pg_catalog.left(a.title, 100) = enforcement_records.excerpt)
        end);

revoke all on table nestly.enforcement_records from public, anon;
grant select on table nestly.enforcement_records to authenticated;
grant insert (user_id, target_kind, target_id, rule, excerpt, report_id) on table nestly.enforcement_records to authenticated;

-- 2. A justified report deletes the content (FR-MOD-003, BR-080, OP-053, §10.4) ---------------------------------------------------
-- Only in the transaction that closed a report on it as action_taken, by the staff member who closed it, with the content key.
create policy posts_delete_staff on nestly.posts
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.post_id = posts.id and r.status = 'handled' and r.resolution = 'action_taken'
                  and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()));

create policy comments_delete_staff on nestly.comments
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.comment_id = comments.id and r.status = 'handled' and r.resolution = 'action_taken'
                  and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()));

create policy marketplace_listings_delete_staff on nestly.marketplace_listings
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('MARKETPLACE_MODERATE'))
    and exists (select 1 from nestly.reports r where r.listing_id = marketplace_listings.id and r.status = 'handled' and r.resolution = 'action_taken'
                  and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()));

create policy professional_reviews_delete_staff on nestly.professional_reviews
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.review_id = professional_reviews.id and r.status = 'handled' and r.resolution = 'action_taken'
                  and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()));

create policy professional_articles_delete_staff on nestly.professional_articles
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.article_id = professional_articles.id and r.status = 'handled' and r.resolution = 'action_taken'
                  and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()));

-- a review is deleted by staff only (its writer holds no DELETE)
grant delete on table nestly.professional_reviews to authenticated;

-- The staff member's deletion writes its enforcement record (the author, the rule, the first 100 characters; a listing: its title), and the
-- reports still open on a deleted post's comments (or a deleted comment's replies) expire with them: their content goes with it. SECURITY INVOKER,
-- as the staff member; the author's own delete and a cascade (run as the owner) pass untouched.
create function nestly.content_staff_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb := pg_catalog.to_jsonb(old);
  v_kind text;
  v_author uuid;
  v_excerpt text;
  v_report uuid;
  v_rule text;
begin
  -- two steps: the job and the owner (cascades) hold no EXECUTE on the staff helper
  if current_user <> 'authenticated' then
    return old;
  end if;
  if (select nestly.caller_staff_role()) is null then
    return old;
  end if;
  v_kind := case tg_table_name when 'posts' then 'post' when 'comments' then 'comment' when 'marketplace_listings' then 'listing'
                               when 'professional_reviews' then 'review' else 'article' end;
  -- the justified report (the highest priority among those closed now), on the item's own column so its index serves the lookup
  select r.id, r.reason into v_report, v_rule
    from nestly.reports r join nestly.report_reasons rr on rr.key = r.reason
   where r.status = 'handled' and r.resolution = 'action_taken' and r.handled_by = (select auth.uid()) and r.closed_at = pg_catalog.now()
     and ((v_kind = 'post' and r.post_id = old.id) or (v_kind = 'comment' and r.comment_id = old.id) or (v_kind = 'listing' and r.listing_id = old.id)
       or (v_kind = 'review' and r.review_id = old.id) or (v_kind = 'article' and r.article_id = old.id))
   order by rr.priority, r.created_at, r.id
   limit 1;
  if v_report is null then
    raise exception 'content: staff delete only content whose report they closed as justified' using errcode = '42501';
  end if;
  -- a review names no writer (FR-MOD-001: never identified, staff included); an anonymous post's author_id is NULL (rule 20)
  v_author := case v_kind when 'listing' then (v_old ->> 'owner_id')::uuid when 'review' then null
                          else (v_old ->> 'author_id')::uuid end;
  v_excerpt := pg_catalog.left(coalesce(case v_kind when 'listing' then v_old ->> 'title' when 'article' then v_old ->> 'title'
                                                   else v_old ->> 'body' end, ''), 100);
  -- the reports still open on the item itself, on a deleted post's comments or on a deleted comment's replies expire with them: their content
  -- goes (reports_handle_guard allows exactly this, from inside this trigger)
  if v_kind = 'post' then
    update nestly.reports set status = 'expired' where status = 'open' and (post_id = old.id or (target_kind = 'comment' and thread_post_id = old.id));
  elsif v_kind = 'comment' then
    update nestly.reports set status = 'expired'
     where status = 'open' and (comment_id = old.id or comment_id in (select c.id from nestly.comments c where c.parent_id = old.id));
  elsif v_kind = 'listing' then
    update nestly.reports set status = 'expired' where status = 'open' and listing_id = old.id;
  elsif v_kind = 'review' then
    update nestly.reports set status = 'expired' where status = 'open' and review_id = old.id;
  else
    update nestly.reports set status = 'expired' where status = 'open' and article_id = old.id;
  end if;
  insert into nestly.enforcement_records (user_id, target_kind, target_id, rule, excerpt, report_id)
  values (v_author, v_kind, old.id, v_rule, v_excerpt, v_report);
  return old;
end
$$;

revoke execute on function nestly.content_staff_delete() from public;

create trigger posts_staff_delete before delete on nestly.posts for each row execute function nestly.content_staff_delete();
create trigger comments_staff_delete before delete on nestly.comments for each row execute function nestly.content_staff_delete();
create trigger marketplace_listings_staff_delete before delete on nestly.marketplace_listings for each row execute function nestly.content_staff_delete();
create trigger professional_reviews_staff_delete before delete on nestly.professional_reviews for each row execute function nestly.content_staff_delete();
create trigger professional_articles_staff_delete before delete on nestly.professional_articles for each row execute function nestly.content_staff_delete();

-- reports_handle_guard (replaced): as before, plus the expiry above -- only from inside another trigger (content_staff_delete), only an open report
-- whose item, or (a comment report) whose post or parent comment, the caller has just closed as justified.
create or replace function nestly.reports_handle_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.status = 'open' and new.status = 'expired' and new.resolution is null and pg_catalog.pg_trigger_depth() > 1
     and old.target_kind in ('post', 'comment', 'listing', 'review', 'article')
     and exists (select 1 from nestly.reports j
                  where j.status = 'handled' and j.resolution = 'action_taken' and j.handled_by = (select auth.uid())
                    and j.closed_at = pg_catalog.now()
                    and (j.post_id = old.post_id or j.comment_id = old.comment_id or j.listing_id = old.listing_id
                      or j.review_id = old.review_id or j.article_id = old.article_id
                      or (old.target_kind = 'comment' and (j.post_id = old.thread_post_id
                        or j.comment_id = (select c.parent_id from nestly.comments c where c.id = old.comment_id))))) then
    new.closed_at := pg_catalog.now();
    return new;
  end if;
  if old.status <> 'open' or new.status <> 'handled' or new.resolution is null then
    raise exception 'reports: a report is only closed as handled, with a resolution' using errcode = '42501';
  end if;
  new.handled_by := (select auth.uid());
  new.closed_at := pg_catalog.now();
  return new;
end
$$;

-- reports_update_staff (replaced): as 20261022600000, and the expiry above passes the check
drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case when target_kind in ('user', 'message')
           then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                 or (select nestly.has_permission('USER_BAN')))
           when target_kind = 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled' or (status = 'expired' and resolution is null));

-- 3. More than ten identical reports hide the item until a decision (BR-074, FR-MOD-001, §10.4) ------------------------------------
create table nestly.report_auto_hides (
  id           uuid        not null default gen_random_uuid(),
  target_kind  text        not null,
  post_id      uuid,
  comment_id   uuid,
  listing_id   uuid,
  review_id    uuid,
  article_id   uuid,
  reason       text        not null,
  author_id    uuid,
  hidden_at    timestamptz not null default now(),
  hidden_until timestamptz not null default (now() + interval '90 days'),
  constraint report_auto_hides_pkey primary key (id),
  constraint report_auto_hides_target_kind_check check (target_kind in ('post', 'comment', 'listing', 'review', 'article')),
  constraint report_auto_hides_one_target_check check (num_nonnulls(post_id, comment_id, listing_id, review_id, article_id) = 1
    and case target_kind when 'post' then post_id is not null when 'comment' then comment_id is not null
                         when 'listing' then listing_id is not null when 'review' then review_id is not null else article_id is not null end),
  constraint report_auto_hides_until_check check (hidden_until <= hidden_at + interval '90 days'),
  constraint report_auto_hides_post_key unique (post_id),
  constraint report_auto_hides_comment_key unique (comment_id),
  constraint report_auto_hides_listing_key unique (listing_id),
  constraint report_auto_hides_review_key unique (review_id),
  constraint report_auto_hides_article_key unique (article_id),
  constraint report_auto_hides_post_id_fkey foreign key (post_id) references nestly.posts (id) on delete cascade,
  constraint report_auto_hides_comment_id_fkey foreign key (comment_id) references nestly.comments (id) on delete cascade,
  constraint report_auto_hides_listing_id_fkey foreign key (listing_id) references nestly.marketplace_listings (id) on delete cascade,
  constraint report_auto_hides_review_id_fkey foreign key (review_id) references nestly.professional_reviews (id) on delete cascade,
  constraint report_auto_hides_article_id_fkey foreign key (article_id) references nestly.professional_articles (id) on delete cascade,
  constraint report_auto_hides_reason_fkey foreign key (reason) references nestly.report_reasons (key),
  constraint report_auto_hides_author_id_fkey foreign key (author_id) references nestly.users (id) on delete cascade
);

create index report_auto_hides_author_id_idx on nestly.report_auto_hides (author_id) where author_id is not null;

-- The scope of one identical_reports_hide() call: a random nonce it writes for its own transaction, names in nestly.auto_hide_scope while it
-- reads, and deletes again (the trend_scopes pattern). No runtime role reads or writes it, so a caller who sets the settings opens nothing,
-- in this function or in any other definer of the transaction.
create table nestly.auto_hide_scopes (
  nonce uuid not null,
  xact  xid8 not null default pg_catalog.pg_current_xact_id(),
  constraint auto_hide_scopes_pkey primary key (nonce)
);

alter table nestly.report_auto_hides enable row level security, force row level security;
alter table nestly.auto_hide_scopes enable row level security, force row level security;

create policy auto_hide_scopes_insert_definer on nestly.auto_hide_scopes
  for insert to app_owner
  with check (xact = pg_catalog.pg_current_xact_id());

create policy auto_hide_scopes_select_definer on nestly.auto_hide_scopes
  for select to app_owner
  using (xact = pg_catalog.pg_current_xact_id_if_assigned());

create policy auto_hide_scopes_delete_definer on nestly.auto_hide_scopes
  for delete to app_owner
  using (xact = pg_catalog.pg_current_xact_id_if_assigned());

revoke all on table nestly.auto_hide_scopes from public, anon, authenticated;

-- true only inside identical_reports_hide(): the setting names a nonce of this transaction's scope rows
create function nestly.auto_hide_scoped()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from nestly.auto_hide_scopes s
                  where s.xact = pg_catalog.pg_current_xact_id_if_assigned()
                    and s.nonce::text = pg_catalog.current_setting('nestly.auto_hide_scope', true))
$$;

revoke execute on function nestly.auto_hide_scoped() from public;

-- Every active account reads that an item is hidden (only the item and when the hide ends: the reason and the author are no client's to read,
-- staff included), except the item's author and anyone who reported the item: for them nothing changed (no learning, AC-132). The
-- RESTRICTIVE *_auto_hide policies hide the item exactly where this row is readable.
create policy report_auto_hides_select_community on nestly.report_auto_hides
  for select to authenticated
  using ((select nestly.is_active_account()) and author_id is distinct from (select auth.uid())
    and not exists (select 1 from nestly.reports r
                     where r.reporter_id = (select auth.uid())
                       and (r.post_id = report_auto_hides.post_id or r.comment_id = report_auto_hides.comment_id
                         or r.listing_id = report_auto_hides.listing_id or r.review_id = report_auto_hides.review_id
                         or r.article_id = report_auto_hides.article_id)));

create policy report_auto_hides_select_staff on nestly.report_auto_hides
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')));

-- released by the staff decision that closes the last open report on the item (report_auto_hides_lift, as the staff member)
create policy report_auto_hides_delete_staff on nestly.report_auto_hides
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and not exists (select 1 from nestly.reports r
                     where r.status = 'open'
                       and (r.post_id = report_auto_hides.post_id or r.comment_id = report_auto_hides.comment_id
                         or r.listing_id = report_auto_hides.listing_id or r.review_id = report_auto_hides.review_id
                         or r.article_id = report_auto_hides.article_id)));

-- identical_reports_hide() (the definer, owner app_owner) writes, reads and renews (a lapsed one) a hide only for the item its scope names
create policy report_auto_hides_insert_definer on nestly.report_auto_hides
  for insert to app_owner
  with check ((select nestly.auto_hide_scoped())
    and coalesce(post_id, comment_id, listing_id, review_id, article_id)::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy report_auto_hides_select_definer on nestly.report_auto_hides
  for select to app_owner
  using ((select nestly.auto_hide_scoped())
    and coalesce(post_id, comment_id, listing_id, review_id, article_id)::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy report_auto_hides_delete_definer on nestly.report_auto_hides
  for delete to app_owner
  using ((select nestly.auto_hide_scoped()) and hidden_until <= pg_catalog.now()
    and coalesce(post_id, comment_id, listing_id, review_id, article_id)::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

revoke all on table nestly.report_auto_hides from public, anon, authenticated;
-- column-level SELECT: which item and until when; never the reason or the author (an anonymous post's real author, rule 20)
grant select (id, target_kind, post_id, comment_id, listing_id, review_id, article_id, hidden_until) on table nestly.report_auto_hides to authenticated;
grant delete on table nestly.report_auto_hides to authenticated;

-- The definer's reads (TO app_owner, open only inside its scope, for the one item, and its post, that the call names): the reports on it, and
-- its author.
create policy reports_select_auto_hide on nestly.reports
  for select to app_owner
  using ((select nestly.auto_hide_scoped())
    and coalesce(post_id, comment_id, listing_id, review_id, article_id)::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy posts_select_auto_hide on nestly.posts
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and id::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy post_authors_select_auto_hide on nestly.post_authors
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and post_id::text = pg_catalog.current_setting('nestly.auto_hide_post', true));

create policy comments_select_auto_hide on nestly.comments
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and id::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy marketplace_listings_select_auto_hide on nestly.marketplace_listings
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and id::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy professional_reviews_select_auto_hide on nestly.professional_reviews
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and id::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

create policy professional_articles_select_auto_hide on nestly.professional_articles
  for select to app_owner
  using ((select nestly.auto_hide_scoped()) and id::text = pg_catalog.current_setting('nestly.auto_hide_target', true));

-- SECURITY DEFINER (rule 17, approved by Afik 21.10.2026), owner app_owner, pinned search_path. AFTER INSERT on reports, as the reporter (the new
-- report names auth.uid()): counts the different people with an open report of the same reason on the same item (one report per person and
-- item, ERR-046, so repeats never count); at ten or more, hides the item (renewing a lapsed hide), naming its author (a post's real author for
-- an anonymous post) so the author keeps seeing it. One item at a time (an advisory lock on it), so two reports at once still count each other.
-- The reporter's answer is the same either way: the function returns nothing
-- and raises nothing of its own.
create function nestly.identical_reports_hide()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target uuid := coalesce(new.post_id, new.comment_id, new.listing_id, new.review_id, new.article_id);
  v_people integer;
  v_author uuid;
  v_post uuid;
  v_nonce uuid := pg_catalog.gen_random_uuid();
begin
  if v_target is null or new.status <> 'open' or new.target_kind not in ('post', 'comment', 'listing', 'review', 'article')
     or new.reporter_id is distinct from auth.uid() then
    return null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8301, pg_catalog.hashtext(v_target::text));
  insert into nestly.auto_hide_scopes (nonce) values (v_nonce);
  perform pg_catalog.set_config('nestly.auto_hide_scope', v_nonce::text, true);
  perform pg_catalog.set_config('nestly.auto_hide_target', v_target::text, true);
  -- the item's own column, so its index serves the count
  select count(distinct r.reporter_id)::integer into v_people
    from nestly.reports r
   where r.status = 'open' and r.reason = new.reason
     and case new.target_kind when 'post' then r.post_id = v_target when 'comment' then r.comment_id = v_target
                              when 'listing' then r.listing_id = v_target when 'review' then r.review_id = v_target
                              else r.article_id = v_target end;
  if v_people >= 10 then
    -- a lapsed hide (past its 90 days) gives way to a new one
    delete from nestly.report_auto_hides h
     where coalesce(h.post_id, h.comment_id, h.listing_id, h.review_id, h.article_id) = v_target and h.hidden_until <= pg_catalog.now();
    if not exists (select 1 from nestly.report_auto_hides h
                    where coalesce(h.post_id, h.comment_id, h.listing_id, h.review_id, h.article_id) = v_target) then
      if new.target_kind = 'post' then
        select p.author_id into v_author from nestly.posts p where p.id = v_target;
        v_post := v_target;
      elsif new.target_kind = 'comment' then
        select c.author_id, c.post_id into v_author, v_post from nestly.comments c where c.id = v_target;
      elsif new.target_kind = 'listing' then
        select l.owner_id into v_author from nestly.marketplace_listings l where l.id = v_target;
      elsif new.target_kind = 'review' then
        -- the writer is never identified (FR-MOD-001); it is kept here only so that the writer keeps seeing the review (author_id is no client's)
        select rv.reviewer_id into v_author from nestly.professional_reviews rv where rv.id = v_target;
      elsif new.target_kind = 'article' then
        select a.author_id into v_author from nestly.professional_articles a where a.id = v_target;
      end if;
      -- an anonymous post (and its author's own comments in it): the real author, from post_authors (rule 20; it never leaves the table: no
      -- client reads author_id)
      if v_author is null and v_post is not null then
        perform pg_catalog.set_config('nestly.auto_hide_post', v_post::text, true);
        select pa.author_id into v_author from nestly.post_authors pa where pa.post_id = v_post;
        perform pg_catalog.set_config('nestly.auto_hide_post', '', true);
      end if;
      insert into nestly.report_auto_hides (target_kind, post_id, comment_id, listing_id, review_id, article_id, reason, author_id)
      values (new.target_kind, new.post_id, new.comment_id, new.listing_id, new.review_id, new.article_id, new.reason, v_author)
      on conflict do nothing;
    end if;
  end if;
  perform pg_catalog.set_config('nestly.auto_hide_target', '', true);
  perform pg_catalog.set_config('nestly.auto_hide_scope', '', true);
  delete from nestly.auto_hide_scopes where nonce = v_nonce;
  return null;
end
$$;

revoke execute on function nestly.identical_reports_hide() from public;

create trigger reports_identical_hide
  after insert on nestly.reports
  for each row execute function nestly.identical_reports_hide();

-- The hide is released when the last open report on the item is closed and the item stays (dismissed, or closed without a deletion); a
-- deleted item takes its hide with it (cascade). As the staff member; the job's expiry releases nothing (no policy).
create function nestly.report_auto_hides_lift()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    delete from nestly.report_auto_hides h
     where (new.post_id is not null and h.post_id = new.post_id) or (new.comment_id is not null and h.comment_id = new.comment_id)
        or (new.listing_id is not null and h.listing_id = new.listing_id) or (new.review_id is not null and h.review_id = new.review_id)
        or (new.article_id is not null and h.article_id = new.article_id);
  end if;
  return null;
end
$$;

revoke execute on function nestly.report_auto_hides_lift() from public;

create trigger reports_auto_hide_lift
  after update of status on nestly.reports
  for each row when (old.status = 'open' and new.status <> 'open' and new.target_kind in ('post', 'comment', 'listing', 'review', 'article'))
  execute function nestly.report_auto_hides_lift();

-- The hide itself: an item with a hide readable to the caller is not shown to them (staff always see it).
create policy posts_auto_hide on nestly.posts
  as restrictive for select to authenticated
  using ((select nestly.caller_staff_role()) is not null
    or not exists (select 1 from nestly.report_auto_hides h where h.post_id = posts.id and h.hidden_until > pg_catalog.now()));

create policy comments_auto_hide on nestly.comments
  as restrictive for select to authenticated
  using ((select nestly.caller_staff_role()) is not null
    or not exists (select 1 from nestly.report_auto_hides h where h.comment_id = comments.id and h.hidden_until > pg_catalog.now()));

create policy marketplace_listings_auto_hide on nestly.marketplace_listings
  as restrictive for select to authenticated
  using ((select nestly.caller_staff_role()) is not null
    or not exists (select 1 from nestly.report_auto_hides h where h.listing_id = marketplace_listings.id and h.hidden_until > pg_catalog.now()));

create policy professional_reviews_auto_hide on nestly.professional_reviews
  as restrictive for select to authenticated
  using ((select nestly.caller_staff_role()) is not null
    or not exists (select 1 from nestly.report_auto_hides h where h.review_id = professional_reviews.id and h.hidden_until > pg_catalog.now()));

create policy professional_articles_auto_hide on nestly.professional_articles
  as restrictive for select to authenticated
  using ((select nestly.caller_staff_role()) is not null
    or not exists (select 1 from nestly.report_auto_hides h where h.article_id = professional_articles.id and h.hidden_until > pg_catalog.now()));

-- 4. Every opening of a reported comment is audited (FR-MOD-003, BR-082, Afik 21.10.2026, §10 item 9) ------------------------------
create table nestly.reported_comment_views (
  id         uuid        not null default gen_random_uuid(),
  report_id  uuid        not null,
  viewer_id  uuid        not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint reported_comment_views_pkey primary key (id),
  constraint reported_comment_views_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete cascade,
  constraint reported_comment_views_viewer_id_fkey foreign key (viewer_id) references nestly.users (id) on delete restrict
);

create index reported_comment_views_report_id_idx on nestly.reported_comment_views (report_id);
create index reported_comment_views_viewer_id_idx on nestly.reported_comment_views (viewer_id);

alter table nestly.reported_comment_views enable row level security, force row level security;

create policy reported_comment_views_select_own on nestly.reported_comment_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

-- REPORTS_VIEW, on a report of a comment that still exists, open or closed
create policy reported_comment_views_insert_staff on nestly.reported_comment_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r
                 where r.id = reported_comment_views.report_id and r.target_kind = 'comment' and r.comment_id is not null));

revoke all on table nestly.reported_comment_views from public, anon;
grant select on table nestly.reported_comment_views to authenticated;
grant insert (report_id) on table nestly.reported_comment_views to authenticated;

-- 5. A staff member opens a restricted profile in full, audited (BR-081, FR-PRIV-001, §10.3) ---------------------------------------
create table nestly.profile_staff_views (
  id         uuid        not null default gen_random_uuid(),
  target_id  uuid        not null,
  viewer_id  uuid        not null default auth.uid(),
  view_xact  xid8        not null default pg_catalog.pg_current_xact_id(),
  created_at timestamptz not null default now(),
  constraint profile_staff_views_pkey primary key (id),
  constraint profile_staff_views_target_id_fkey foreign key (target_id) references nestly.users (id) on delete cascade,
  constraint profile_staff_views_viewer_id_fkey foreign key (viewer_id) references nestly.users (id) on delete restrict
);

create index profile_staff_views_target_id_idx on nestly.profile_staff_views (target_id);
create index profile_staff_views_viewer_id_idx on nestly.profile_staff_views (viewer_id);

alter table nestly.profile_staff_views enable row level security, force row level security;

create policy profile_staff_views_select_own on nestly.profile_staff_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

-- any active staff account (BR-081: every staff account opens a profile for review), in its own name
create policy profile_staff_views_insert_staff on nestly.profile_staff_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid()) and (select nestly.caller_staff_role()) is not null);

revoke all on table nestly.profile_staff_views from public, anon;
grant select on table nestly.profile_staff_views to authenticated;
grant insert (target_id) on table nestly.profile_staff_views to authenticated;

-- profile_view (replaced): the body of 20261017170000 with the staff opening (v_staff) as the one change
create or replace function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean,
               shows_empty_journey_sentence boolean, relationship text, friends jsonb, mutual_friends jsonb, outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_n integer;
  v_w integer;
  v_opens timestamptz[];
  v_logged boolean;
  v_rel text;
  v_friend boolean;
  v_staff boolean;
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then
    return;
  end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  -- new (c22): the limit is stored data and fails closed.
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'profile_open';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'profile_view: profile_open limit missing or invalid' using errcode = 'NS001';
  end if;
  -- new (c20): the caller's own counter row, locked for the rest of the transaction (one account is serialized, others never wait).
  insert into nestly.profile_open_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.opened_at, c.is_refusal_recorded into v_opens, v_logged;
  v_opens := array(select t from pg_catalog.unnest(v_opens) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_opens) >= v_n then
    -- c21: the first refusal of a stretch records one Security event; the refused open is not counted.
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('profile_open_limit', v_me);
    end if;
    update nestly.profile_open_counts c set opened_at = v_opens, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.profile_view_target', '', true);
    return query select null::text, null::text, null::smallint, null::jsonb, null::boolean, null::boolean,
                        null::text, null::jsonb, null::jsonb, 'limited'::text;
    return;
  end if;
  update nestly.profile_open_counts c set opened_at = v_opens || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  -- new (c19): the relationship state, for a Regular caller only; a Professional gets NULL.
  if (select u.account_type from nestly.users u where u.id = v_me) = 'regular' then
    select case when pg_catalog.bool_or(f.status = 'accepted') then 'friends'
                when pg_catalog.bool_or(f.status = 'pending' and f.cancelled_at is null and f.addressee_id = v_me) then 'received'
                when pg_catalog.bool_or(f.status in ('pending', 'declined') and f.cancelled_at is null and f.requester_id = v_me) then 'sent'
                else 'none' end
      into v_rel
      from nestly.friendships f
      where (f.requester_id = v_me and f.addressee_id = p_target::uuid) or (f.addressee_id = v_me and f.requester_id = p_target::uuid);
  end if;
  v_friend := v_rel is not distinct from 'friends';
  -- I14 completion B (BR-081, §10.3): a staff member whose transaction recorded its opening of this profile (profile_staff_views, audited)
  -- sees it in full, as a Friend does; never tracker data, which no profile view returns.
  v_staff := exists (select 1 from nestly.profile_staff_views v
                      where v.viewer_id = v_me and v.target_id = p_target::uuid
                        and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned());
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown),
           v_rel, fl.list, fl.mutual, 'shown'::text                                      -- new: c18, c19
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' or v_friend or v_staff as is_full) s   -- DR-2 A; staff: I14 completion B
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    -- new (c18): the target's Friends and the ones the caller shares; each entry exactly the id and the full name.
    cross join lateral (
      select coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id), '[]'::jsonb) as list,
             coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id) filter (where x.is_mutual), '[]'::jsonb) as mutual
      from (select n.user_id, n.full_name,
                   pg_catalog.jsonb_build_object('userId', n.user_id, 'fullName', n.full_name) as e,
                   exists (select 1 from nestly.friendships m   -- the caller's own rows: friendships_select_party
                           where m.status = 'accepted'
                             and ((m.requester_id = v_me and m.addressee_id = n.user_id)
                               or (m.addressee_id = v_me and m.requester_id = n.user_id))) as is_mutual
            from nestly.friendships f
            join nestly.regular_names n on n.user_id = case when f.requester_id = p.user_id then f.addressee_id else f.requester_id end
            where p.user_id in (f.requester_id, f.addressee_id) and f.status = 'accepted' and n.user_id <> v_me) x) fl
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end
$$;


-- 6. An announcement's audience (FR-ADMIN-008, OP-042 closed, VAL-050, §10.7) -------------------------------------------------------
alter table nestly.system_announcements
  add column audience       text not null default 'everyone',
  add column audience_stage text;

alter table nestly.system_announcements
  add constraint system_announcements_audience_check check (audience in ('everyone', 'parents', 'professionals', 'stage')),
  add constraint system_announcements_audience_stage_check check (
    (audience = 'stage') = (audience_stage is not null) and (audience_stage is null or audience_stage in ('planning', 'pregnant', 'has_child')));

-- a published announcement is read by the accounts it addresses: everyone; parents (Regular accounts); Professionals; or the Regular accounts
-- whose chosen stages include the stage (journey_contexts, their own rows). A staff account reads "everyone" only here (SYSTEM_ANNOUNCEMENTS
-- reads every announcement through system_announcements_select_staff, as before).
drop policy system_announcements_select_published on nestly.system_announcements;
create policy system_announcements_select_published on nestly.system_announcements
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'published'
    and (audience = 'everyone'
      or (audience = 'parents' and (select nestly.caller_account_type()) = 'regular')
      or (audience = 'professionals' and (select nestly.caller_account_type()) = 'professional')
      or (audience = 'stage' and (select nestly.caller_account_type()) = 'regular'
          and exists (select 1 from nestly.journey_contexts j
                       where j.user_id = (select auth.uid()) and j.stage = system_announcements.audience_stage))));

grant insert (audience, audience_stage), update (audience, audience_stage) on table nestly.system_announcements to authenticated;

-- system_announcements_prepare (replaced): as 20261022200000, and a change of the audience alone is an edit too (written and audited)
create or replace function nestly.system_announcements_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := null;
    new.removed_at := null;
    return new;
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status in ('published', 'removed')) or (old.status = 'published' and new.status = 'removed')) then
      raise exception 'system_announcements: % cannot become %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'published' then new.published_at := pg_catalog.now(); end if;
    if new.status = 'removed' then new.removed_at := pg_catalog.now(); end if;
  elsif new.title is not distinct from old.title and new.body is not distinct from old.body
        and new.audience is not distinct from old.audience and new.audience_stage is not distinct from old.audience_stage then
    return null; -- nothing changes: no row is written and nothing is audited
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- 7. Children's tracker trends by calendar period, rounded (FR-ADMIN-015, OP-056 closed, §10.2) -------------------------------------
-- Expand: the 30/90/365-day version (text, text, text, integer) stays only until the server calls this one (the code PR of this completion);
-- the next migration drops it (contract). Until then it is reached only by the server's current trends screen.

-- SECURITY DEFINER (approved exception, Afik 21.10.2026, §9.2; replaced per §10.2), owner app_owner, pinned search_path. As 20261022800000
-- except: the period is a calendar week (Sunday to Saturday) or month in Israel time, this one (up to now) or the previous one; the split is
-- the child's age or sex only (a week or month split overlapped the periods); a shown cell's number of children is rounded to the nearest 10
-- and its average to one decimal; a cell is hidden on its TRUE count (fewer than 10 children or 10 families), before any rounding.
create function nestly.child_tracker_trends(p_metric text, p_field text, p_dimension text, p_period text)
returns table (bucket text, bucket_order integer, children integer, value numeric, is_suppressed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := nestly.caller_staff_role();
  v_min constant integer := 10;
  v_cells integer;
  v_nonce uuid := pg_catalog.gen_random_uuid();
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_from date;
  v_to date;
begin
  if v_role is null or not nestly.has_permission('CHILD_DATA_VIEW') then
    raise exception 'child_tracker_trends: not allowed' using errcode = '42501';
  end if;
  if p_metric is null or p_metric not in ('breastfeeding', 'bottle', 'sleep', 'diaper', 'medicine', 'growth', 'vaccine', 'bath')
     or p_field is null or not (p_field = 'events_per_day'
       or (p_field = 'duration_minutes' and p_metric in ('breastfeeding', 'sleep'))
       or (p_field = 'amount_ml' and p_metric = 'bottle')
       or (p_field in ('weight_kg', 'height_cm', 'head_cm') and p_metric = 'growth'))
     or p_dimension is null or p_dimension not in ('child_age', 'child_sex')
     or p_period is null or p_period not in ('this_week', 'last_week', 'this_month', 'last_month') then
    raise exception 'child_tracker_trends: not a metric, field, dimension and period from the lists' using errcode = '22023';
  end if;
  -- [v_from, v_to): Israel calendar days; the week starts on Sunday
  v_from := case p_period
    when 'this_week' then v_today - pg_catalog.date_part('dow', v_today)::integer
    when 'last_week' then v_today - pg_catalog.date_part('dow', v_today)::integer - 7
    when 'this_month' then pg_catalog.date_trunc('month', v_today)::date
    else (pg_catalog.date_trunc('month', v_today) - interval '1 month')::date end;
  v_to := case p_period
    when 'this_week' then v_today + 1
    when 'last_week' then v_today - pg_catalog.date_part('dow', v_today)::integer
    when 'this_month' then v_today + 1
    else pg_catalog.date_trunc('month', v_today)::date end;

  insert into nestly.trend_scopes (nonce) values (v_nonce);
  perform pg_catalog.set_config('nestly.child_data_scope', v_nonce::text, true);
  return query
  with ev as (
    select e.child_id, e.user_id, l.local::date as day, c.sex, c.birth_date, e.occurred_at,
           case p_field
             when 'duration_minutes' then extract(epoch from e.ended_at - e.occurred_at) / 60
             when 'amount_ml' then e.amount_ml::numeric
             when 'weight_kg' then e.weight_kg
             when 'height_cm' then e.height_cm
             when 'head_cm' then e.head_cm
           end as measure
      from nestly.tracker_events e
      join nestly.children c on c.id = e.child_id
      join nestly.users u on u.id = e.user_id and u.status = 'active'
      cross join lateral (select e.occurred_at at time zone 'Asia/Jerusalem' as local) l
     where e.kind = p_metric
       and l.local::date >= v_from and l.local::date < v_to
       and e.occurred_at <= pg_catalog.now()
       and c.birth_date <= l.local::date
  ),
  celled as (
    select ev.child_id, ev.user_id, ev.day, ev.measure,
           case p_dimension
             when 'child_sex' then ev.sex
             else (select case when a.m < 3 then '0-2' when a.m < 6 then '3-5' when a.m < 12 then '6-11' when a.m < 24 then '12-23'
                                when a.m < 60 then '24-59' else '60+' end
                     from (select nestly.child_age_months(ev.birth_date, ev.occurred_at) as m) a)
           end as cell
      from ev
     where p_field = 'events_per_day' or ev.measure is not null
  ),
  per_child as (
    select x.cell, x.child_id, x.user_id,
           case when p_field = 'events_per_day' then count(*)::numeric / count(distinct x.day) else avg(x.measure) end as v
      from celled x
     group by x.cell, x.child_id, x.user_id
  ),
  agg as (
    select pc.cell, count(*)::integer as n, count(distinct pc.user_id)::integer as families, avg(pc.v) as v
      from per_child pc
     group by pc.cell
  ),
  buckets as (
    select b.name, b.ord::integer as ord
      from pg_catalog.unnest(case p_dimension
             when 'child_age' then array['0-2', '3-5', '6-11', '12-23', '24-59', '60+']
             else array['girl', 'boy', 'unknown'] end) with ordinality as b(name, ord)
  )
  select b.name,
         b.ord,
         case when coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min then (round(a.n / 10.0) * 10)::integer end,
         case when coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min then round(a.v, 1) end,
         not (coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min)
    from buckets b
    left join agg a on a.cell = b.name
   order by b.ord;
  get diagnostics v_cells = row_count;
  perform pg_catalog.set_config('nestly.child_data_scope', '', true);
  delete from nestly.trend_scopes where nonce = v_nonce;

  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, after_state)
  values (v_role, 'CHILD_DATA_VIEW', 'child_data_queried', 'child_data',
          pg_catalog.jsonb_build_object('metric', p_metric, 'field', p_field, 'dimension', p_dimension, 'period', p_period, 'cells', v_cells));
  return;
end
$$;

revoke execute on function nestly.child_tracker_trends(text, text, text, text) from public;
grant execute on function nestly.child_tracker_trends(text, text, text, text) to authenticated;

-- 8. The upload block list: perceptual hashes of images marked as suspected child abuse (NFR-MEDIA-001, BR-076, §10.4) --------------
-- The job records an image's 64-bit perceptual hash (difference hash) once (media_fingerprints); the hash of every image marked as suspected
-- goes to the block list (suspected_image_fingerprints); an upload whose hash is within 6 bits of a listed one is rejected and held as a
-- suspicion (queue reason hash_match), with no account action. Hashes only, never an image; no client reads either table.
alter table nestly.media_reviews drop constraint media_reviews_queue_reason_check;
alter table nestly.media_reviews add constraint media_reviews_queue_reason_check
  check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error', 'hash_match'));

create table nestly.media_fingerprints (
  media_id    uuid        not null,
  fingerprint bigint      not null,
  created_at  timestamptz not null default now(),
  constraint media_fingerprints_pkey primary key (media_id),
  constraint media_fingerprints_media_id_fkey foreign key (media_id) references nestly.media_assets (id) on delete cascade
);

create table nestly.suspected_image_fingerprints (
  id              uuid        not null default gen_random_uuid(),
  fingerprint     bigint      not null,
  source_media_id uuid        not null,
  created_at      timestamptz not null default now(),
  constraint suspected_image_fingerprints_pkey primary key (id),
  constraint suspected_image_fingerprints_fingerprint_key unique (fingerprint),
  constraint suspected_image_fingerprints_source_media_id_key unique (source_media_id)
);

alter table nestly.media_fingerprints enable row level security, force row level security;
alter table nestly.suspected_image_fingerprints enable row level security, force row level security;

-- the job only (rule 6, the I5 family): records the hash of a pending image (its check) or of a suspected one (for the list), once
create policy media_fingerprints_select_jobs on nestly.media_fingerprints
  for select to app_media_jobs
  using (true);

create policy media_fingerprints_insert_jobs on nestly.media_fingerprints
  for insert to app_media_jobs
  with check (exists (select 1 from nestly.media_assets m where m.id = media_fingerprints.media_id
                       and (m.status = 'pending' or exists (select 1 from nestly.media_reviews r where r.media_id = m.id and r.is_suspected))));

-- the job only: reads the list, and adds the hash it recorded of an image marked as suspected. No client policy: no account (staff included)
-- reads the list. Kept with no expiry until Afik decides (appendix B).
create policy suspected_image_fingerprints_select_jobs on nestly.suspected_image_fingerprints
  for select to app_media_jobs
  using (true);

-- only a suspicion a staff member marked or confirmed (suspected_by): a hash_match the job marked never extends the list by itself
create policy suspected_image_fingerprints_insert_jobs on nestly.suspected_image_fingerprints
  for insert to app_media_jobs
  with check (exists (select 1 from nestly.media_reviews r join nestly.media_fingerprints f on f.media_id = r.media_id
                       where r.media_id = suspected_image_fingerprints.source_media_id and r.is_suspected and r.suspected_by is not null
                         and f.fingerprint = suspected_image_fingerprints.fingerprint));

-- Afik 21.10.2026: an upload that matched is an item in the staff queue (CONTENT_MODERATE). Staff decide: confirmed (a suspicion now in a staff
-- member's name; its hash may join the list) or not_abuse (a false positive: the listed hashes it matched leave the list, audited). Staff read
-- the hashes only for that: the item's own, and the listed ones within 6 bits of it, inside the transaction that decided not_abuse.
alter table nestly.media_reviews
  add column match_decision   text,
  add column match_decided_by uuid,
  add column match_decided_at timestamptz;
alter table nestly.media_reviews
  add constraint media_reviews_match_decision_check check (match_decision is null or (match_decision in ('confirmed', 'not_abuse') and queue_reason = 'hash_match')),
  add constraint media_reviews_match_decided_check check ((match_decision is null) = (match_decided_at is null)),
  add constraint media_reviews_match_decided_by_fkey foreign key (match_decided_by) references nestly.users (id) on delete set null;
create index media_reviews_match_decided_by_idx on nestly.media_reviews (match_decided_by) where match_decided_by is not null;

create policy media_reviews_update_hash_staff on nestly.media_reviews
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and queue_reason = 'hash_match' and match_decision is null)
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')));

create policy media_fingerprints_select_staff on nestly.media_fingerprints
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.media_reviews r where r.media_id = media_fingerprints.media_id and r.queue_reason = 'hash_match'
                  and r.match_decision = 'not_abuse' and r.match_decided_at = pg_catalog.now()));

create policy suspected_image_fingerprints_select_staff on nestly.suspected_image_fingerprints
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.media_reviews r join nestly.media_fingerprints f on f.media_id = r.media_id
                 where r.queue_reason = 'hash_match' and r.match_decision = 'not_abuse' and r.match_decided_at = pg_catalog.now()
                   and pg_catalog.bit_count(pg_catalog.int8send(f.fingerprint # suspected_image_fingerprints.fingerprint)) <= 6));

create policy suspected_image_fingerprints_delete_staff on nestly.suspected_image_fingerprints
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.media_reviews r join nestly.media_fingerprints f on f.media_id = r.media_id
                 where r.queue_reason = 'hash_match' and r.match_decision = 'not_abuse' and r.match_decided_at = pg_catalog.now()
                   and pg_catalog.bit_count(pg_catalog.int8send(f.fingerprint # suspected_image_fingerprints.fingerprint)) <= 6));

-- the false positive's hashes leave the list in the staff member's transaction (audited per hash: media_hash_removed)
create function nestly.media_hash_not_abuse()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    delete from nestly.suspected_image_fingerprints h
     using nestly.media_fingerprints f
     where f.media_id = new.media_id and pg_catalog.bit_count(pg_catalog.int8send(f.fingerprint # h.fingerprint)) <= 6;
  end if;
  return null;
end
$$;

revoke execute on function nestly.media_hash_not_abuse() from public;

create trigger media_reviews_hash_not_abuse
  after update of match_decision on nestly.media_reviews
  for each row when (new.match_decision = 'not_abuse' and old.match_decision is null)
  execute function nestly.media_hash_not_abuse();

revoke all on table nestly.media_fingerprints, nestly.suspected_image_fingerprints from public, anon;
grant select (media_id, fingerprint, created_at), insert (media_id, fingerprint) on table nestly.media_fingerprints to app_media_jobs;
grant select (id, fingerprint, source_media_id, created_at), insert (fingerprint, source_media_id) on table nestly.suspected_image_fingerprints to app_media_jobs;

grant update (is_held) on table nestly.media_assets to app_media_jobs;
grant select (match_decision, match_decided_at) , update (match_decision) on table nestly.media_reviews to authenticated;
grant select (match_decision, suspected_by) on table nestly.media_reviews to app_media_jobs;
grant select (media_id, fingerprint) on table nestly.media_fingerprints to authenticated;
grant select (fingerprint, source_media_id), delete on table nestly.suspected_image_fingerprints to authenticated;
grant insert (is_suspected) on table nestly.media_reviews to app_media_jobs;

-- the job's review of a block-list match: a suspicion, from the job (no staff member)
drop policy media_reviews_insert_jobs on nestly.media_reviews;
create policy media_reviews_insert_jobs on nestly.media_reviews
  for insert to app_media_jobs
  with check (queue_reason is not null and not is_child
    and is_suspected = (queue_reason = 'hash_match')
    and exists (select 1 from nestly.media_assets m where m.id = media_reviews.media_id and m.status = 'pending'));

-- and its move: a pending image to passed or queued, as before, or to rejected and held after a match
drop policy media_assets_update_jobs on nestly.media_assets;
create policy media_assets_update_jobs on nestly.media_assets
  for update to app_media_jobs
  using (status = 'pending')
  with check (status in ('pending', 'passed', 'queued') or (status = 'rejected' and is_held));

-- the guards (replaced): the bodies of 20261022600000 / 20261021500000 with the job's hash steps first
create or replace function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
  v_suspected boolean;
begin
  if current_user = 'app_media_jobs' and old.status = 'pending' and new.status = 'rejected' then
    -- an upload that matched the block list (its suspicion review, hash_match, is written first and checked against the list there): rejected
    -- and held as a suspicion at once (M6), the uploader sees the same rejection as any other (ERR-041); nothing else moves
    if not new.is_held or new.is_file_removed or new.check_attempts < old.check_attempts
       or new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id or new.position is distinct from old.position
       or new.decided_by is distinct from old.decided_by
       or not exists (select 1 from nestly.media_reviews r where r.media_id = new.id and r.queue_reason = 'hash_match' and r.is_suspected) then
      raise exception 'media: the job rejects only an image that matched the block list' using errcode = '42501';
    end if;
    -- decided by no staff member (decided_by stays NULL): the time is the database's
    new.checked_at := pg_catalog.now();
    new.decided_at := pg_catalog.now();
    return new;
  end if;
  if new.is_held is distinct from old.is_held and current_user <> 'authenticated' then
    raise exception 'media: only a staff decision holds an image' using errcode = '42501';
  end if;
  if current_user = 'app_media_jobs' then
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id
       or new.position is distinct from old.position or new.decided_at is distinct from old.decided_at then
      raise exception 'media: the job cannot decide' using errcode = '42501';
    end if;
    if old.status = 'rejected' then
      -- a rejected image's file is gone: the job records only that (Afik 20.10.2026)
      if new.status <> 'rejected' or not new.is_file_removed or new.check_attempts <> old.check_attempts then
        raise exception 'media: the job only records a removed file' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'pending' or new.status not in ('pending', 'passed', 'queued') or new.is_file_removed or new.check_attempts < old.check_attempts then
      raise exception 'media: the check moves only a pending image, to passed or queued' using errcode = '42501';
    end if;
    if new.status = 'queued' and not exists (select 1 from nestly.media_reviews r where r.media_id = new.id and r.queue_reason is not null) then
      raise exception 'media: a queued image has its reason first' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then new.checked_at := pg_catalog.now(); end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status then
    -- a staff decision (BR-076 as of 20.10.2026): a queued image approved or rejected; a passed or approved one rejected after a report (not
    -- a dismissed one) or as a suspicion
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    select coalesce(bool_or(r.is_suspected), false) into v_suspected from nestly.media_reviews r where r.media_id = new.id;
    if old.status = 'queued' and new.status in ('approved', 'rejected') then
      if v_suspected and new.status <> 'rejected' then
        raise exception 'media: a suspected image is rejected' using errcode = '23514';
      end if;
    elsif old.status in ('passed', 'approved') and new.status = 'rejected' then
      -- after a report on its post, its listing or its uploader that is open (the moderator acts, then closes it) or was handled with action
      -- taken; a dismissed report is no ground. Or as a suspicion. The uploader sees the same rejection either way.
      if not (select nestly.has_permission('REPORTS_VIEW')) or not (v_suspected
          or exists (select 1 from nestly.reports r where (r.status = 'open' or r.resolution = 'action_taken')
                       and ((old.post_id is not null and r.post_id = old.post_id)
                         or (old.listing_id is not null and r.listing_id = old.listing_id)
                         or r.reported_user_id = old.owner_id))) then
        raise exception 'media: a checked image is removed only after a report or as a suspicion' using errcode = '42501';
      end if;
    else
      raise exception 'media: not a decision' using errcode = '23514';
    end if;
    new.is_held := v_suspected;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    return new;
  end if;
  if new.is_held is distinct from old.is_held then
    raise exception 'media: only a decision holds an image' using errcode = '42501';
  end if;
  if old.status = 'rejected' or old.post_id is not null or old.listing_id is not null or old.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  if old.kind = 'listing' then
    -- the uploader attaches a listing image to a listing of its own, once (FR-MKT-002; VAL-041: at most 6, by the unique position)
    if new.listing_id is null or new.post_id is not null or new.sponsored_product_id is not null then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    select exists (select 1 from nestly.marketplace_listings l where l.id = new.listing_id and l.owner_id = (select auth.uid())) into v_mine;
    if not v_mine then
      raise exception 'media: the listing is not yours' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.kind = 'sponsored' then
    -- the Admin attaches a sponsored image to a sponsored product it manages, once (FR-ADMIN-009; one image, position 0)
    if new.sponsored_product_id is null or new.post_id is not null or new.listing_id is not null
       or not (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE'))
       or not exists (select 1 from nestly.sponsored_products sp where sp.id = new.sponsored_product_id and sp.status <> 'removed') then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    return new;
  end if;
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if new.post_id is null or old.kind <> 'post' or new.listing_id is not null or new.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  select exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = (select auth.uid()))
      or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid()))
    into v_mine;
  if not v_mine then
    raise exception 'media: the post is not yours' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function nestly.media_reviews_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'app_media_jobs' then
    -- I14 completion B (NFR-MEDIA-001, §10.4): a pending upload whose recorded hash is within 6 bits of a hash on the block list is marked as
    -- a suspicion by the job (no staff member; 90 days, M6), with the queue reason hash_match
    if tg_op = 'INSERT' and new.queue_reason = 'hash_match' then
      if not new.is_suspected or new.is_child or not exists (
           select 1 from nestly.media_assets m
             join nestly.media_fingerprints f on f.media_id = m.id
             join nestly.suspected_image_fingerprints h on pg_catalog.bit_count(pg_catalog.int8send(h.fingerprint # f.fingerprint)) <= 6
            where m.id = new.media_id and m.status = 'pending') then
        raise exception 'media_reviews: no block-list match' using errcode = '42501';
      end if;
      new.suspected_by := null;
      new.suspected_at := pg_catalog.now();
      new.purge_after := pg_catalog.now() + interval '90 days';
      return new;
    end if;
    if tg_op <> 'INSERT' or new.is_child or new.is_suspected then
      raise exception 'media_reviews: the job records the queue reason only' using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.queue_reason is distinct from old.queue_reason or new.scores is distinct from old.scores
      or (old.is_suspected and not new.is_suspected)) then
    raise exception 'media_reviews: staff mark a child or a suspicion only' using errcode = '42501';
  end if;
  -- I14 completion B (Afik 21.10.2026): staff decide a block-list match once: confirmed (the suspicion is now in their name) or not_abuse
  if tg_op = 'INSERT' and new.match_decision is not null then
    raise exception 'media_reviews: a decision is made on a match only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.match_decision is distinct from old.match_decision then
    if old.match_decision is not null or new.match_decision is null or old.queue_reason is distinct from 'hash_match' or not old.is_suspected then
      raise exception 'media_reviews: a block-list match is decided once' using errcode = '42501';
    end if;
    new.match_decided_by := (select auth.uid());
    new.match_decided_at := pg_catalog.now();
    new.suspected_by := case when new.match_decision = 'confirmed' then coalesce(old.suspected_by, (select auth.uid())) else old.suspected_by end;
    new.suspected_at := old.suspected_at;
    new.purge_after := old.purge_after;
    return new;
  elsif tg_op = 'UPDATE' then
    new.match_decided_by := old.match_decided_by;
    new.match_decided_at := old.match_decided_at;
  end if;
  if new.is_suspected and (tg_op = 'INSERT' or not old.is_suspected) then
    new.suspected_by := (select auth.uid());
    new.suspected_at := pg_catalog.now();
    new.purge_after := pg_catalog.now() + interval '90 days';
  elsif tg_op = 'UPDATE' then
    new.suspected_by := old.suspected_by;
    new.suspected_at := old.suspected_at;
    new.purge_after := old.purge_after;
  end if;
  return new;
end
$$;

-- 9. The audit trigger, replaced with the three new branches and the audience (the body of 20261022800000 otherwise) ----------------
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name in ('professional_reviews', 'professional_articles') then
    -- FR-MOD-001, FR-SERV-011, FR-PRO-003 (I11 follow-ups): a reported review or article hidden, removed or restored by CONTENT_MODERATE.
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'moderation' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'professional_reviews' then 'review' else 'article' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'moderation');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'moderation');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told). I14 completion B (Afik 21.10.2026): a staff
    -- decision on a block-list match, confirmed or not_abuse (a false positive, whose listed hashes leave the list: media_hash_removed).
    v_key := 'CONTENT_MODERATE';
    v_action := case when tg_op = 'UPDATE' and v_new ->> 'match_decision' is distinct from v_old ->> 'match_decision'
                     then 'media_hash_' || (v_new ->> 'match_decision') else 'media_suspected' end;
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after', 'hashDecision', v_new ->> 'match_decision');
  elsif tg_table_name = 'suspected_image_fingerprints' then
    -- I14 completion B (Afik 21.10.2026): a hash left the block list after staff decided a match was not abuse (a false positive). Never the hash.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_hash_removed';
    v_kind := 'media';
    v_target := (v_old ->> 'source_media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('reason', 'not_abuse');
  elsif tg_table_name = 'support_requests' then
    -- FR-ADMIN-002: a status change of a Support request (the trigger fires only when the status moves).
    v_key := 'SUPPORT_HANDLE';
    v_action := 'support_status_changed';
    v_kind := 'support_request';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'topic', v_new ->> 'topic');
  elsif tg_table_name = 'support_messages' then
    -- FR-ADMIN-002, FR-CHAT-004: a reply in the name of Support or an internal note (the trigger fires only for author_kind 'support').
    -- The entry carries what it was, never the text.
    v_key := 'SUPPORT_HANDLE';
    v_action := case when (v_new ->> 'is_internal')::boolean then 'support_note_added' else 'support_replied' end;
    v_kind := 'support_request';
    v_target := (v_new ->> 'support_request_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('internal', v_new -> 'is_internal', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'));
  elsif tg_table_name = 'reported_message_views' then
    -- §9.6 (Afik 20.10.2026): a staff member opened a reported chat message (only that message; never the conversation).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_message_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites or revokes an invitation (its redemption is audited on staff_roles). Never the code or its hash.
    if tg_op = 'INSERT' then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invited';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_after := pg_catalog.jsonb_build_object('note', v_new ->> 'note', 'expiresAt', v_new ->> 'expires_at');
    elsif v_new ->> 'revoked_at' is not null and v_old ->> 'revoked_at' is null then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invitation_revoked';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_before := pg_catalog.jsonb_build_object('note', v_old ->> 'note');
    else
      raise exception 'audit_trigger: only an invitation issued or revoked is audited here' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_roles' then
    -- FR-ADMIN-004: a Moderator created from an invitation (the new staff role exists now, so the entry carries it as the actor).
    v_action := 'moderator_joined';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    -- I14 completion (Afik 21.10.2026, decisions-in-force.md §9.1): the use of the invitation is recorded with it
    v_after := pg_catalog.jsonb_build_object('invitationId', (select i.id from nestly.moderator_invitations i where i.code_hash = nestly.moderator_invite_hash()));
  elsif tg_table_name = 'system_announcements' then
    -- FR-ADMIN-008, AC-049: created, edited, published or removed. Before/After carry the status, the title and the body's length.
    v_key := 'SYSTEM_ANNOUNCEMENTS';
    v_action := case
      when tg_op = 'INSERT' then 'announcement_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'announcement_' || (v_new ->> 'status')
      else 'announcement_edited' end;
    v_kind := 'announcement';
    v_target := (v_new ->> 'id')::uuid;
    -- I14 completion B (§10.7): the audience too
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body'), 'audience', v_old ->> 'audience', 'audienceStage', v_old ->> 'audience_stage') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body', 'audience', v_new ->> 'audience',
      'audienceStage', v_new ->> 'audience_stage');
  elsif tg_table_name = 'private_group_content_views' then
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (that post or comment with its post and comments, the
    -- report's context since the I14 completion: withThread; never the rest of the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end,
      'withThread', true);
  elsif tg_table_name = 'marketplace_listings' then
    -- §3.2 MARKETPLACE_MODERATE (I12): a listing hidden or restored (the trigger fires only when is_hidden moves). Never its title.
    v_key := 'MARKETPLACE_MODERATE';
    v_action := case when (v_new ->> 'is_hidden')::boolean then 'listing_hidden' else 'listing_restored' end;
    v_kind := 'listing';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('hidden', v_old -> 'is_hidden');
    v_after := pg_catalog.jsonb_build_object('hidden', v_new -> 'is_hidden', 'status', v_new ->> 'status', 'category', v_new ->> 'category');
  elsif tg_table_name = 'sponsored_products' then
    -- FR-ADMIN-009, AC-058 (I12): a Sponsored Product created, edited, published, paused or removed (Admin Only key).
    v_key := 'SPONSORED_PRODUCT_MANAGE';
    v_action := case
      when tg_op = 'INSERT' then 'sponsored_product_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'sponsored_product_' || (v_new ->> 'status')
      else 'sponsored_product_edited' end;
    v_kind := 'sponsored_product';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'sponsor', v_old ->> 'sponsor_name', 'category', v_old ->> 'category', 'linkUrl', v_old ->> 'link_url') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'sponsor', v_new ->> 'sponsor_name',
      'category', v_new ->> 'category', 'linkUrl', v_new ->> 'link_url',
      'descriptionChanged', tg_op = 'UPDATE' and v_new ->> 'description' is distinct from v_old ->> 'description');
  elsif tg_table_name = 'group_staff_views' then
    -- I14 completion (§9.7, BR-040): a staff member opened a Private Group's page for review (its content, in that transaction only).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_viewed';
    v_kind := 'group';
    v_target := (v_new ->> 'group_id')::uuid;
  elsif tg_table_name = 'report_escalations' then
    -- I14 completion (Afik 21.10.2026, §9.9): a Moderator escalated a report to the Admin; the note is the entry's reason.
    v_key := 'REPORTS_VIEW';
    v_action := 'report_escalated';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_reason := v_new ->> 'note';
  elsif tg_table_name = 'enforcement_records' then
    -- I14 completion B (FR-MOD-003, §10.4): reported content deleted by a justified decision (its enforcement record). Never the text.
    v_key := case v_new ->> 'target_kind' when 'listing' then 'MARKETPLACE_MODERATE' else 'CONTENT_MODERATE' end;
    v_action := 'content_deleted';
    v_kind := v_new ->> 'target_kind';
    v_target := (v_new ->> 'target_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('rule', v_new ->> 'rule', 'reportId', v_new ->> 'report_id', 'named', v_new ->> 'user_id' is not null);
  elsif tg_table_name = 'reported_comment_views' then
    -- I14 completion B (Afik 21.10.2026): a staff member opened a reported comment (every opening, also after the report closed).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_comment_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'profile_staff_views' then
    -- I14 completion B (BR-081, §10.3): a staff member opened a Regular account's profile (shown in full, never tracker data). No key: every
    -- staff account opens profiles for review.
    v_action := 'staff_profile_viewed';
    v_kind := 'user';
    v_target := (v_new ->> 'target_id')::uuid;
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger enforcement_records_audit
  after insert on nestly.enforcement_records
  for each row execute function nestly.audit_trigger();

create trigger reported_comment_views_audit
  after insert on nestly.reported_comment_views
  for each row execute function nestly.audit_trigger();

create trigger profile_staff_views_audit
  after insert on nestly.profile_staff_views
  for each row execute function nestly.audit_trigger();

create trigger media_reviews_match_decision_audit
  after update of match_decision on nestly.media_reviews
  for each row when (new.match_decision is not null and old.match_decision is null)
  execute function nestly.audit_trigger();

create trigger suspected_image_fingerprints_audit
  after delete on nestly.suspected_image_fingerprints
  for each row execute function nestly.audit_trigger();

-- 10. Comments ---------------------------------------------------------------------------------------------------------------------
comment on table nestly.enforcement_records is 'I14 completion B (FR-MOD-002/003, Afik 21.10.2026 §10.4): the enforcement history of reported content. One row per justified decision: a post, comment, listing, review or article deleted by staff (content_staff_delete, in the transaction that closed its report as action_taken). USER_VIEW (the Admin always) reads them; nobody edits or deletes one. Kept 12 months for an active account (§13.4).';
comment on column nestly.enforcement_records.id is 'Row id.';
comment on column nestly.enforcement_records.user_id is 'The author of the deleted content (a listing: its owner; a review: its writer). NULL for an anonymous post and its author''s own comments (rule 20: never named in the history).';
comment on column nestly.enforcement_records.target_kind is 'What was deleted: post, comment, listing, review or article.';
comment on column nestly.enforcement_records.target_id is 'The deleted item''s id (gone; no FK).';
comment on column nestly.enforcement_records.rule is 'The rule broken: the reason of the highest-priority report closed as justified (report_reasons).';
comment on column nestly.enforcement_records.excerpt is 'At most the first 100 characters of the text (a listing or an article: its title). Staff text: never shown to a community user.';
comment on column nestly.enforcement_records.report_id is 'The justified report (SET NULL when the report goes).';
comment on column nestly.enforcement_records.decided_by is 'The staff member who decided (default auth.uid(); no INSERT grant).';
comment on column nestly.enforcement_records.decided_at is 'Database clock.';
comment on policy enforcement_records_select_staff on nestly.enforcement_records is 'USER_VIEW (the Admin always) reads the enforcement history (PG-028).';
comment on policy enforcement_records_insert_staff on nestly.enforcement_records is 'The staff member''s deletion writes it: the content key, and a report this staff member closed as action_taken in this transaction.';
comment on function nestly.content_staff_delete() is 'BEFORE DELETE, SECURITY INVOKER. A staff member''s deletion of reported content (only after closing a report on it as justified in this transaction, else 42501) writes its enforcement record, and expires the open reports on a deleted post''s comments or a deleted comment''s replies. The author''s own delete and cascades (as the owner) pass untouched.';
comment on function nestly.reports_handle_guard() is 'BEFORE UPDATE, SECURITY INVOKER. A client closes an open report only as handled, with a resolution (who and when set here); or, from inside content_staff_delete only, expires an open comment report whose post or parent comment it has just deleted as justified.';
comment on policy reports_update_staff on nestly.reports is 'REPORTS_VIEW with the key for the target (a user or message: a user key; a listing: MARKETPLACE_MODERATE; content: CONTENT_MODERATE) closes an open report, or expires it with the deleted content.';
comment on policy posts_delete_staff on nestly.posts is 'I14 completion B (§10.4, OP-053): CONTENT_MODERATE deletes a post in the transaction that closed a report on it as justified.';
comment on policy comments_delete_staff on nestly.comments is 'I14 completion B: CONTENT_MODERATE deletes a comment in the transaction that closed a report on it as justified.';
comment on policy marketplace_listings_delete_staff on nestly.marketplace_listings is 'I14 completion B: MARKETPLACE_MODERATE deletes a listing in the transaction that closed a report on it as justified.';
comment on policy professional_reviews_delete_staff on nestly.professional_reviews is 'I14 completion B: CONTENT_MODERATE deletes a review in the transaction that closed a report on it as justified (a writer never deletes a review).';
comment on policy professional_articles_delete_staff on nestly.professional_articles is 'I14 completion B: CONTENT_MODERATE deletes an article in the transaction that closed a report on it as justified.';

comment on table nestly.report_auto_hides is 'I14 completion B (BR-074, Afik 21.10.2026 §10.4): ten or more different people reported the item for the same reason; it is hidden from every other reader (the *_auto_hide RESTRICTIVE policies) until a staff decision, at most 90 days. Not readable to the item''s author or to anyone who reported it (no learning, AC-132), so they see no change; staff see the item. Written only by identical_reports_hide(); released by report_auto_hides_lift(); gone with its item.';
comment on column nestly.report_auto_hides.id is 'Row id.';
comment on column nestly.report_auto_hides.target_kind is 'post, comment, listing, review or article.';
comment on column nestly.report_auto_hides.post_id is 'The hidden post (cascade).';
comment on column nestly.report_auto_hides.comment_id is 'The hidden comment (cascade).';
comment on column nestly.report_auto_hides.listing_id is 'The hidden listing (cascade).';
comment on column nestly.report_auto_hides.review_id is 'The hidden review (cascade).';
comment on column nestly.report_auto_hides.article_id is 'The hidden article (cascade).';
comment on column nestly.report_auto_hides.reason is 'The reason the ten people chose.';
comment on column nestly.report_auto_hides.author_id is 'The item''s author (an anonymous post''s real author), who keeps seeing it: this row is not readable to them.';
comment on column nestly.report_auto_hides.hidden_at is 'Database clock.';
comment on column nestly.report_auto_hides.hidden_until is 'At most 90 days after hidden_at (BR-080''s cap); after it the item shows again.';
comment on policy report_auto_hides_select_community on nestly.report_auto_hides is 'Every active account but the item''s author and its reporters reads the hide (and so does not see the item).';
comment on policy report_auto_hides_select_staff on nestly.report_auto_hides is 'REPORTS_VIEW reads every hide (the queue).';
comment on policy report_auto_hides_delete_staff on nestly.report_auto_hides is 'REPORTS_VIEW releases a hide once no report on the item is open (report_auto_hides_lift).';
comment on policy report_auto_hides_insert_definer on nestly.report_auto_hides is 'Rule 17 (approved by Afik 21.10.2026): identical_reports_hide() writes the hide of the one item its transaction names (nestly.auto_hide_target).';
comment on policy report_auto_hides_select_definer on nestly.report_auto_hides is 'Rule 17: identical_reports_hide() reads whether the item it names is already hidden.';
comment on policy reports_select_auto_hide on nestly.reports is 'Rule 17 (approved by Afik 21.10.2026): identical_reports_hide() counts the reports on the one item it names.';
comment on policy posts_select_auto_hide on nestly.posts is 'Rule 17: identical_reports_hide() reads the author of the one post it names.';
comment on policy post_authors_select_auto_hide on nestly.post_authors is 'Rule 17/20: identical_reports_hide() reads the real author of the one anonymous post it names (nestly.auto_hide_post), only to keep the post visible to them.';
comment on policy comments_select_auto_hide on nestly.comments is 'Rule 17: identical_reports_hide() reads the author of the one comment it names.';
comment on policy marketplace_listings_select_auto_hide on nestly.marketplace_listings is 'Rule 17: identical_reports_hide() reads the owner of the one listing it names.';
comment on policy professional_reviews_select_auto_hide on nestly.professional_reviews is 'Rule 17: identical_reports_hide() reads the writer of the one review it names.';
comment on policy professional_articles_select_auto_hide on nestly.professional_articles is 'Rule 17: identical_reports_hide() reads the author of the one article it names.';
comment on function nestly.identical_reports_hide() is 'SECURITY DEFINER (rule 17, approved by Afik 21.10.2026, night), owner app_owner, pinned search_path. AFTER INSERT on reports, as the reporter: when ten or more different people hold an open report of the same reason on the same post, comment, listing, review or article, hides it (report_auto_hides) naming its author. Reads only through the *_select_auto_hide TO app_owner policies, open for the one item it names; returns nothing, raises nothing: the reporter''s answer never changes.';
comment on function nestly.report_auto_hides_lift() is 'AFTER UPDATE, SECURITY INVOKER. When a report on an item closes, the staff member releases its hide if no report on it is still open.';
comment on policy posts_auto_hide on nestly.posts is 'RESTRICTIVE (I14 completion B): a post with a hide readable to the caller is not shown (its author and reporters cannot read the hide); staff see it.';
comment on policy comments_auto_hide on nestly.comments is 'RESTRICTIVE (I14 completion B): as posts_auto_hide, for a comment.';
comment on policy marketplace_listings_auto_hide on nestly.marketplace_listings is 'RESTRICTIVE (I14 completion B): as posts_auto_hide, for a listing.';
comment on policy professional_reviews_auto_hide on nestly.professional_reviews is 'RESTRICTIVE (I14 completion B): as posts_auto_hide, for a review.';
comment on policy professional_articles_auto_hide on nestly.professional_articles is 'RESTRICTIVE (I14 completion B): as posts_auto_hide, for an article.';

comment on table nestly.reported_comment_views is 'I14 completion B (Afik 21.10.2026, §10 item 9): every opening of a reported comment by a staff member, also after its report closed; audited (reported_comment_viewed). No UPDATE or DELETE; they go with their report.';
comment on column nestly.reported_comment_views.id is 'Row id.';
comment on column nestly.reported_comment_views.report_id is 'The comment report opened.';
comment on column nestly.reported_comment_views.viewer_id is 'The staff member (default auth.uid()).';
comment on column nestly.reported_comment_views.created_at is 'Database clock.';
comment on policy reported_comment_views_select_own on nestly.reported_comment_views is 'A staff member reads its own openings.';
comment on policy reported_comment_views_insert_staff on nestly.reported_comment_views is 'REPORTS_VIEW records its opening of a report on a comment that still exists, open or closed.';

comment on table nestly.profile_staff_views is 'I14 completion B (BR-081, Afik 21.10.2026 §10.3): a staff member opened a Regular account''s profile; audited (staff_profile_viewed). In that transaction profile_view() shows the profile in full (as a Friend sees it), never tracker data. No UPDATE or DELETE.';
comment on column nestly.profile_staff_views.id is 'Row id.';
comment on column nestly.profile_staff_views.target_id is 'The profile''s account (cascade).';
comment on column nestly.profile_staff_views.viewer_id is 'The staff member (default auth.uid()).';
comment on column nestly.profile_staff_views.view_xact is 'The opening''s transaction (not granted): the full view holds inside it only.';
comment on column nestly.profile_staff_views.created_at is 'Database clock.';
comment on policy profile_staff_views_select_own on nestly.profile_staff_views is 'A staff member reads its own openings (profile_view reads it, inherited).';
comment on policy profile_staff_views_insert_staff on nestly.profile_staff_views is 'Any active staff account records its own opening of a profile.';
comment on function nestly.profile_view(text) is
  'One other Regular account''s profile (FR-PRIV-001, BR-044, AC-054, AC-078, NFR-SEC-006; F2.3b, F2.4c1; I14 completion B): counts the open first (rolling window, N and W from security_limits; the Nth+1 returns one row with outcome limited and everything else NULL, and records one Security event per stretch; absent or invalid configuration raises NS001). Otherwise 0 or 1 row with outcome shown: full_name, children_count, is_pregnant, shows_empty_journey_sentence always; gender and child_ages ([{years, months}]) when the target is Open, the caller''s Friend, or a staff member who recorded this opening in this transaction (profile_staff_views, audited; BR-081); relationship (none, sent, received, friends; NULL for a non-Regular caller); friends and mutual_friends ([{userId, fullName}]). Never a child''s name, sex, birth date, id or slot, a due date, a setting, a status or tracker data. Caller active (is_active_account()); target active and Regular, else 0 rows, already counted. SECURITY DEFINER (data-model.md "Approved exceptions", DR-G1, DR-L A); EXECUTE authenticated.';

comment on column nestly.system_announcements.audience is 'I14 completion B (OP-042, VAL-050): who reads it once published: everyone, parents (Regular accounts), professionals, or stage (Regular accounts whose chosen stages include audience_stage). Staff accounts read everyone only (SYSTEM_ANNOUNCEMENTS: all).';
comment on column nestly.system_announcements.audience_stage is 'The stage of an audience "stage" (planning, pregnant, has_child); NULL otherwise.';
comment on policy system_announcements_select_published on nestly.system_announcements is 'An active account reads a published announcement addressed to it (audience: everyone; parents = Regular; professionals; a stage among its own journey stages).';

comment on function nestly.child_tracker_trends(text, text, text, text) is 'SECURITY DEFINER (approved exception, Afik 21.10.2026, decisions-in-force.md §9.2; periods and rounding per §10.2), owner app_owner, pinned search_path. Children''s tracker data as general trends only, for CHILD_DATA_VIEW (the Admin always; not part of ANALYTICS_VIEW) with a valid session: metric (a tracker kind) x field (events_per_day; duration_minutes for breastfeeding and sleep; amount_ml for bottle; weight_kg, height_cm, head_cm for growth) x dimension (child_age, child_sex) x period (this_week, last_week, this_month, last_month: Israel calendar, the week from Sunday), each from a closed list (else 22023). One row per cell of a fixed bucket list: the number of children rounded to the nearest 10 and one average (of each child''s own average) to one decimal, both NULL and is_suppressed unless the cell truly holds at least 10 children of at least 10 families. Only children of active accounts count. Never a row, an id, a name, a birth date, a medicine''s or vaccine''s name or a note. Appends child_data_queried to the Audit Log in the same call. Reads through tracker_events_select_child_data, children_select_child_data and users_select_child_data, opened only while it holds its scope (trend_scopes).';

comment on table nestly.media_fingerprints is 'I14 completion B (NFR-MEDIA-001, §10.4): the 64-bit perceptual hash (difference hash) of an image, recorded once by the job when it checks a pending image or for an image marked as suspected; compared with the block list. Goes with its image. No client reads it.';
comment on column nestly.media_fingerprints.media_id is 'The image (cascade).';
comment on column nestly.media_fingerprints.fingerprint is 'The hash.';
comment on column nestly.media_fingerprints.created_at is 'Database clock.';
comment on policy media_fingerprints_select_jobs on nestly.media_fingerprints is 'Rule 6 exception (I5 family): the job reads the hashes.';
comment on column nestly.media_reviews.match_decision is 'I14 completion B (Afik 21.10.2026): the staff decision on a block-list match (queue reason hash_match): confirmed (the suspicion is then in their name) or not_abuse (a false positive: the listed hashes it matched leave the list, audited). Once.';
comment on column nestly.media_reviews.match_decided_by is 'Who decided the match (set by the guard; NULL once that account is gone).';
comment on column nestly.media_reviews.match_decided_at is 'When (set by the guard).';
comment on policy media_reviews_update_hash_staff on nestly.media_reviews is 'CONTENT_MODERATE decides an undecided block-list match (the staff queue item, Afik 21.10.2026).';
comment on policy media_fingerprints_select_staff on nestly.media_fingerprints is 'CONTENT_MODERATE reads a match''s own hash only inside the transaction that decided it not_abuse (to clear the list).';
comment on policy suspected_image_fingerprints_select_staff on nestly.suspected_image_fingerprints is 'CONTENT_MODERATE reads the listed hashes within 6 bits of a match only inside the transaction that decided it not_abuse.';
comment on policy suspected_image_fingerprints_delete_staff on nestly.suspected_image_fingerprints is 'CONTENT_MODERATE deletes those hashes in that transaction (media_hash_not_abuse); audited per hash (media_hash_removed).';
comment on function nestly.media_hash_not_abuse() is 'AFTER UPDATE, SECURITY INVOKER, as the staff member: a match decided not_abuse takes the listed hashes within 6 bits of it off the block list.';
comment on policy media_fingerprints_insert_jobs on nestly.media_fingerprints is 'Rule 6 exception (I5 family): the job records the hash of a pending or a suspected image, once.';
comment on table nestly.suspected_image_fingerprints is 'I14 completion B (NFR-MEDIA-001, BR-076, Afik 21.10.2026 §10.4): the block list: the perceptual hash of every image marked as suspected child abuse (hashes only, never an image). An upload within 6 bits of one is rejected (ERR-041) and held as a suspicion. The job only; no client reads it. No expiry until Afik decides (appendix B).';
comment on column nestly.suspected_image_fingerprints.id is 'Row id.';
comment on column nestly.suspected_image_fingerprints.fingerprint is 'The hash (unique).';
comment on column nestly.suspected_image_fingerprints.source_media_id is 'The suspected image it came from (no FK: the hash outlives the image''s 90 days).';
comment on column nestly.suspected_image_fingerprints.created_at is 'Database clock.';
comment on policy suspected_image_fingerprints_select_jobs on nestly.suspected_image_fingerprints is 'Rule 6 exception (I5 family): the job reads the list to compare uploads.';
comment on policy suspected_image_fingerprints_insert_jobs on nestly.suspected_image_fingerprints is 'Rule 6 exception (I5 family): the job adds the hash it recorded on an image marked as suspected.';
comment on policy media_reviews_insert_jobs on nestly.media_reviews is 'Rule 6 exception: the job writes the queue reason and scores of a pending image, before it queues it; or a hash_match suspicion of a pending upload that matched the block list (media_reviews_guard checks the match).';
comment on policy media_assets_update_jobs on nestly.media_assets is 'Rule 6 exception: the job records the check of a pending image (passed or queued, or one more failed attempt), or rejects and holds one that matched the block list.';
comment on function nestly.media_assets_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The job: moves a pending image to passed or queued, or to rejected and held after a block-list match; records a removed file. Staff: a decision (CONTENT_MODERATE; a checked image only after a report or as a suspicion). The uploader: attaches its image once.';
comment on function nestly.media_reviews_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. The job writes the queue reason once, or a hash_match suspicion of a pending upload within 6 bits of the block list (90 days, no staff member); staff mark a child or a suspicion (who, when, 90 days); a suspicion is never withdrawn.';
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message or comment, a Moderator invitation issued or revoked, a Moderator joining with one (with the invitation''s id), a System Announcement created, edited, published or removed (with its audience), a staff view of reported Private Group content or of a Private Group, a Marketplace listing hidden or restored, a Sponsored Product created, edited, published, paused or removed, a reported review or article hidden, removed or restored, a report escalated to the Admin, reported content deleted by a justified decision, or a staff opening of a profile: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason; the note of an escalation) and Before/After. A caller who is no staff member leaves none.';
