-- =====================================================================================================================
-- SRS-audit fixes (Afik's audit, 21.10.2026) — migration only.
--
-- SRS: FR-SEARCH-001 (a Professional is returned by People Search and marked as one) · FR-NOTIF-002/003, BR-037, AC-046, NFR-PRIV-003
--      (a Friend's child's birthday notifies only when the parent allows it) · FR-ADMIN-003/010, BR-058 (Professionals and Marketplace
--      counted on the analytics screen) · decisions-in-force.md §6 (the I7 conditions: no query returns nothing; never an Admin, a
--      Moderator, an inactive account or across a user block; every notification honours the recipient's preferences and blocks).
--
-- 1. search_people(text, integer, integer)   replaced (drop + create: the result gains a column). It now returns active Professionals too,
--      read from professional_profiles under its own reader policy (professional_profiles_select_viewer, which app_owner inherits through
--      `authenticated`: active, never across a user block), and a fourth column account_type ('regular' | 'professional') so the screen
--      marks a Professional. Everything else is unchanged: no query (under 2 or over 100 characters) returns nothing and is not counted,
--      the limit and its Security event, never the caller, never an Admin or a Moderator (neither has a Regular or a Professional profile:
--      both tables reference users with their account_type), never a suspended or banned account.
-- 2. deliver_child_birthdays()   SECURITY DEFINER (rule 17, the I7 shape; to be confirmed by Afik — see WORKPLAN "ממתין לך"). Called by the
--      request server when the caller opens the notifications: writes into the caller's own notifications one `child_birthday` per child of
--      an accepted, active Friend whose birthday (Israel's date) fell in the last seven days, today included — only when the parent allows
--      the birthday in notifications to Friends (regular_profiles.is_child_birthday_shared, BR-037), the caller's `birthdays` category is
--      on, and no user block stands between them. The notification is timed at the start of the birthday, names the parent as its actor and
--      leads to the parent's profile; it carries no child's name, sex, age or id (subject_id is a hash of the child and the year, so one
--      birthday notifies once). A Regular caller only. Nothing is returned but the number written.
--      Scope `birthday` opens two new TO app_owner policies, each limited to the caller's accepted Friends: regular_profiles (the switch)
--      and children (the birth date; the same Friendship check, and the parent's switch on). The other rows it reads (the caller's friendships, preferences and
--      blocks) are the caller's own.
-- 3. Analytics (FR-ADMIN-010, BR-058): professional_follows, conversations and marketplace_listings gain *_select_analytics (the I14 shape:
--      ANALYTICS_VIEW, only in a transaction that named the analytics screen). Counts only; follower_id is still never granted, and
--      conversations hold no message. Groups need no new policy: the screen counts only what every active account already reads (Groups,
--      and Public Groups' members and content); Private Group content and membership are not counted.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261023100000_srs_audit_fixes.down.sql (refuses while a child_birthday notification exists).
-- =====================================================================================================================

-- 1. People Search returns Professionals, marked ---------------------------------------------------------------------------
drop function nestly.search_people(text, integer, integer);

create function nestly.search_people(p_query text, p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, full_name text, outcome text, account_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_q text;
  v_n integer;
  v_w integer;
  v_times timestamptz[];
  v_logged boolean;
  v_esc text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 200));
begin
  if not nestly.is_active_account() or coalesce(nestly.caller_account_type(), '') not in ('regular', 'professional') then
    return;
  end if;
  v_q := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  if pg_catalog.char_length(v_q) < 2 or pg_catalog.char_length(v_q) > 100 then
    return;
  end if;
  perform pg_catalog.set_config('nestly.search_scope', 'people', true);
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'people_search';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'search_people: people_search limit missing or invalid' using errcode = 'NS001';
  end if;
  insert into nestly.people_search_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.searched_at, c.is_refusal_recorded into v_times, v_logged;
  v_times := array(select t from pg_catalog.unnest(v_times) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_times) >= v_n then
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('people_search_limit', v_me);
    end if;
    update nestly.people_search_counts c set searched_at = v_times, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.search_scope', '', true);
    return query select null::uuid, null::text, 'limited'::text, null::text;
    return;
  end if;
  update nestly.people_search_counts c set searched_at = v_times || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  v_esc := pg_catalog.regexp_replace(pg_catalog.lower(v_q), '([\\%_])', '\\\1', 'g');
  return query
    select x.id, x.name, 'found'::text, x.kind
      from (select n.user_id as id, n.full_name as name, 'regular'::text as kind
              from nestly.regular_names n
              join nestly.users u on u.id = n.user_id and u.status = 'active' and u.account_type = 'regular'
            union all
            select pp.user_id, pp.full_name, 'professional'::text
              from nestly.professional_profiles pp
             where pp.user_status = 'active') x
     where x.id <> v_me
       and pg_catalog.lower(x.name) like '%' || v_esc || '%'
     order by case when pg_catalog.lower(x.name) = pg_catalog.lower(v_q) then 0
                   when pg_catalog.lower(x.name) like v_esc || '%' then 1
                   when pg_catalog.lower(x.name) like '% ' || v_esc || '%' then 2
                   else 3 end,
              x.name, x.id
     limit v_limit offset v_offset;
  perform pg_catalog.set_config('nestly.search_scope', '', true);
end
$$;

revoke execute on function nestly.search_people(text, integer, integer) from public;
grant  execute on function nestly.search_people(text, integer, integer) to authenticated;

-- 2. Child birthday notifications (FR-NOTIF-003, BR-037, AC-046) ------------------------------------------------------------
-- What the definer reads of a Friend: the parent's switch, and the birth dates of a parent whose switch is on. Only inside the definer
-- (scope birthday) and only of the caller's accepted, active Friends.
create policy regular_profiles_select_birthday on nestly.regular_profiles
  for select to app_owner
  using ((select nestly.notify_scope()) = 'birthday'
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = regular_profiles.user_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = regular_profiles.user_id))));

create policy children_select_birthday on nestly.children
  for select to app_owner
  using ((select nestly.notify_scope()) = 'birthday'
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = children.user_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = children.user_id)))
    and exists (select 1 from nestly.regular_profiles rp where rp.user_id = children.user_id and rp.is_child_birthday_shared));

create function nestly.deliver_child_birthdays()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_year integer;
  n integer;
begin
  if v_me is null or not nestly.is_active_account() or nestly.caller_account_type() is distinct from 'regular' then
    return 0;
  end if;
  if exists (select 1 from nestly.notification_preferences p
              where p.user_id = v_me and p.category = 'birthdays' and not p.is_in_app_enabled) then
    return 0;
  end if;
  v_year := pg_catalog.date_part('year', v_today)::integer;
  perform pg_catalog.set_config('nestly.notify_scope', 'birthday', true);
  insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id, created_at)
  select v_me, 'child_birthday', b.parent_id, 'user', b.parent_id,
         pg_catalog.md5('child_birthday:' || b.child_id::text || ':' || pg_catalog.date_part('year', b.day)::text)::uuid,
         b.day::timestamp at time zone 'Asia/Jerusalem'
    from (select c.user_id as parent_id, c.id as child_id, c.birth_date as born,
                 (c.birth_date + pg_catalog.make_interval(years => y.y - pg_catalog.date_part('year', c.birth_date)::integer))::date as day
            from nestly.friendships f
            join nestly.children c
              on c.user_id = case when f.requester_id = v_me then f.addressee_id else f.requester_id end
            join nestly.regular_profiles rp on rp.user_id = c.user_id and rp.is_child_birthday_shared
            cross join (values (v_year), (v_year - 1)) as y(y)
           where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
             and v_me in (f.requester_id, f.addressee_id)
             and c.user_id <> all (coalesce(nestly.block_peer_ids(), '{}'::uuid[]))) b
   where b.day between v_today - 6 and v_today
     and b.day > b.born
  on conflict (recipient_id, type, subject_id) do nothing;
  get diagnostics n = row_count;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return n;
end
$$;

revoke execute on function nestly.deliver_child_birthdays() from public;
grant  execute on function nestly.deliver_child_birthdays() to authenticated;

-- 3. Analytics: Professionals and Marketplace (FR-ADMIN-010, BR-058) --------------------------------------------------------
create policy professional_follows_select_analytics on nestly.professional_follows
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy conversations_select_analytics on nestly.conversations
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy marketplace_listings_select_analytics on nestly.marketplace_listings
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));

-- 4. Comments --------------------------------------------------------------------------------------------------------------
comment on function nestly.search_people(text, integer, integer) is
  'FR-SEARCH-001, NFR-SEC-006, BR-044, BR-063, VAL-037, AC-078: People Search. A query under two or over 100 characters returns nothing and is not counted. Counts the call (people_search limit from security_limits, 60 per 3600 s at the seed); the call over the limit returns one row with outcome limited and records one Security event per stretch; absent or invalid configuration raises NS001. Otherwise rows (user_id, full_name, outcome found, account_type) of active Regular and Professional accounts other than the caller (a Professional through its own reader policy, so never across a user block), ranked exact, prefix, word prefix, contains; at most 50 per call, offset up to 200. Never a list without a query, never an Admin or a Moderator. SECURITY DEFINER (rule 17, approved by Afik 20.10.2026 with conditions).';
comment on function nestly.deliver_child_birthdays() is
  'FR-NOTIF-003, BR-037, AC-046: writes into the caller''s own notifications one child_birthday per child of an accepted, active Friend whose birthday (Israel''s date) fell in the last seven days, today included, timed at the start of that day; only when the parent allows it (is_child_birthday_shared), the caller''s birthdays category is on and no user block stands between them. Actor and target: the parent; no child''s name, sex, age or id. Regular callers only; returns the number written. SECURITY DEFINER (rule 17, the I7 shape); scope birthday.';
comment on policy regular_profiles_select_birthday on nestly.regular_profiles is 'deliver_child_birthdays (scope birthday) reads the birthday switch of the caller''s accepted, active Friends only.';
comment on policy children_select_birthday on nestly.children is 'deliver_child_birthdays (scope birthday) reads the children of the caller''s accepted, active Friends only, and only of a parent whose switch is on (BR-037).';
comment on policy professional_follows_select_analytics on nestly.professional_follows is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts new follows on the analytics screen only; follower_id is never granted.';
comment on policy conversations_select_analytics on nestly.conversations is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts conversations opened by context on the analytics screen only; no message is read.';
comment on policy marketplace_listings_select_analytics on nestly.marketplace_listings is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts listings (new, sold, active, by category) on the analytics screen only; never a title, an owner or an id in the answer.';
