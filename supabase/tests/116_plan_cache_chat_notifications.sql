-- pgTAP, run by pg_prove as app_server (CI `db` job): the plan-cached reads of Chat and Notifications (migration 20261027200000;
-- 27.10.2026 performance, .work/briefs/plan-cache.md). Each function is SECURITY INVOKER, executable by authenticated only, and returns
-- under RLS exactly what the statement it replaces returned: compared row for row with that statement, as each person, and a person the
-- policies do not show a row does not get it.
-- People: a, b, c = fr_c (Regular), p (Professional), h = sf_m2 (SUPPORT_VIEW + SUPPORT_HANDLE). a and c are Friends; b is not a Friend
-- of either. Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[plan-cache c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') when 'h' then tests.fx_sf_id('sf_m2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
-- one statement's rows as text, in its own order (or sorted, for a statement without one)
create function pg_temp.rows_of(p_who text, p_sql text, p_sorted boolean default false) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select coalesce(string_agg(x::text, ' | ' %s), '-') from (%s) x $q$, case when p_sorted then 'order by x::text' else '' end, p_sql))
$f$;

-- the functions --------------------------------------------------------------------------------------------------------
create temporary table fns (sig text primary key);
create temporary view fnp as select f.sig, p.oid, p.prosecdef, p.provolatile, p.prolang, p.proconfig, p.proacl, p.proowner
  from fns f join pg_proc p on p.oid::regprocedure::text = f.sig join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'nestly';
insert into fns values ('nestly.chat_conversations()'), ('nestly.chat_pending_incoming()'), ('nestly.chat_pending_outgoing()'),
  ('nestly.chat_support_threads()'), ('nestly.chat_unread_count()'), ('nestly.notifications_latest(integer)'),
  ('nestly.notifications_latest_before(integer,timestamp with time zone,uuid)'), ('nestly.notifications_unread_count()'),
  ('nestly.notifications_bell_counts(text[])'), ('nestly.regular_names_visible(uuid[])');

select is((select count(*)::int from fnp p), 10, '[plan-cache c1] the ten functions exist');
select is((select string_agg(p.sig, ', ' order by p.sig) from fnp p where p.prosecdef), null,
  '[plan-cache c1] every one is SECURITY INVOKER (prosecdef = false): authorization stays in RLS, as the caller');
select is((select string_agg(p.sig, ', ' order by p.sig) from fnp p
            where p.provolatile <> 's' or p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
               or not (p.proconfig @> array['search_path=""', 'plan_cache_mode=force_generic_plan'])), null,
  '[plan-cache c1] every one is a STABLE plpgsql function with search_path = '''' and a generic cached plan');
select is((select string_agg(p.sig, ', ' order by p.sig) from fnp p where has_function_privilege('anon', p.oid, 'execute')), null,
  '[plan-cache c2] anon executes none');
select is((select string_agg(p.sig, ', ' order by p.sig) from fnp p
            where exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e where e.grantee = 0 and e.privilege_type = 'EXECUTE')), null,
  '[plan-cache c2] public holds no EXECUTE');
select is((select count(*)::int from fnp p where has_function_privilege('authenticated', p.oid, 'execute')), 10, '[plan-cache c2] authenticated executes all ten');
select is(tests.as_role('anon', null, 'select count(*)::text from nestly.chat_conversations()'), 'ERR:42501', '[plan-cache c2] a call as anon is refused');

-- the rows: a and c talk; b asks a for a chat; a writes to Support and is answered ------------------------------------------
select tests.fx_sf_grant(pg_temp.id('h'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE']);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_fr_add(pg_temp.id('b'), pg_temp.id('c'));

select is(pg_temp.dml('a', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('friends', %L, %L) $q$,
  least(pg_temp.id('a'), pg_temp.id('c')), greatest(pg_temp.id('a'), pg_temp.id('c')))), 'OK:1', '[plan-cache fixture] a and c open a conversation');
select is(pg_temp.dml('a', format($q$ insert into nestly.messages (conversation_id, body) select id, 'שלום קורה' from nestly.conversations where user_a = %L and user_b = %L $q$,
  least(pg_temp.id('a'), pg_temp.id('c')), greatest(pg_temp.id('a'), pg_temp.id('c')))), 'OK:1', '[plan-cache fixture] a writes to c');
select is(pg_temp.dml('b', format($q$ insert into nestly.chat_requests (target_id, target_account_type, opening_message) values (%L, 'regular', 'אפשר לדבר?') $q$, pg_temp.id('a'))),
  'OK:1', '[plan-cache fixture] b asks a for a chat');
select is(pg_temp.dml('a', $q$ insert into nestly.support_requests (topic, body) values ('bug', 'הכפתור לא עובד') $q$), 'OK:1', '[plan-cache fixture] a writes to Support');
select is(set_config('nestly.staff_view', 'on', true), 'on', '[plan-cache fixture] the admin screens');
select is(pg_temp.dml('h', format($q$ insert into nestly.support_messages (support_request_id, body, is_internal) values (%L, 'תודה, בודקים', false) $q$,
  nullif(pg_temp.n('a', 'select id::text from nestly.support_requests limit 1'), '')::uuid)), 'OK:1', '[plan-cache fixture] Support answers a');
select is(set_config('nestly.staff_view', '', true), '', '[plan-cache fixture] off the admin screens');

-- what each function returns is what its statement returned, for each person ------------------------------------------------
create temporary table people (who text primary key);
insert into people values ('a'), ('b'), ('c'), ('p');

create temporary table pairs (label text primary key, old_sql text not null, new_sql text not null, sorted boolean not null default false);
insert into pairs values
('chat_conversations', $q$
  select c.id, case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as "otherUserId", coalesce(n.full_name, pp.full_name) as "otherName",
         coalesce(lm.body, op.opening_message, oo.opening_message) as "lastText",
         to_char(coalesce(lm.created_at, op.created_at, oo.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastAt",
         coalesce(lm.mine, op.mine, oo.mine) as "lastMine",
         (select count(*)::int from nestly.messages m where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
           and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity')) as unread,
         not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
           and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a))) as "canSend"
  from nestly.conversations c
  left join nestly.regular_names n on n.user_id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join nestly.professional_profiles pp on pp.user_id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join lateral (select m.body, m.created_at, m.sender_id = (select auth.uid()) as mine from nestly.messages m
                      where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
  left join lateral (select r.opening_message, r.created_at, r.requester_id = (select auth.uid()) as mine from nestly.chat_requests r where r.id = c.chat_request_id) op on true
  left join lateral (select o.opening_message, o.created_at, o.professional_id = (select auth.uid()) as mine from nestly.outreach_requests o where o.id = c.outreach_request_id) oo on true
  order by coalesce(lm.created_at, op.created_at, oo.created_at, c.created_at) desc, c.id limit 100 $q$,
  'select * from nestly.chat_conversations()', false),
('chat_pending_incoming', $q$
  select r.id, r.requester_id as "userId", coalesce(n.full_name, pp.full_name) as name, r.opening_message as text, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
  from nestly.chat_requests r left join nestly.regular_names n on n.user_id = r.requester_id left join nestly.professional_profiles pp on pp.user_id = r.requester_id
  where r.target_id = (select auth.uid()) and r.status = 'pending' order by r.created_at desc, r.id limit 100 $q$,
  'select * from nestly.chat_pending_incoming()', false),
('chat_pending_outgoing', $q$
  select r.id, r.target_id as "userId", coalesce(n.full_name, pp.full_name) as name, r.opening_message as text, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
  from nestly.chat_requests r left join nestly.regular_names n on n.user_id = r.target_id left join nestly.professional_profiles pp on pp.user_id = r.target_id
  where r.requester_id = (select auth.uid()) and r.status = 'pending' order by r.created_at desc, r.id limit 100 $q$,
  'select * from nestly.chat_pending_outgoing()', false),
('chat_support_threads', $q$
  select s.id, s.topic, s.status, lm.body as "lastText", to_char(lm.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastAt",
         lm.author_kind = 'support' as "fromSupport",
         (select count(*)::int from nestly.support_messages m where m.support_request_id = s.id and m.author_kind = 'support'
           and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity')) as unread
  from nestly.support_requests s
  join lateral (select m.body, m.created_at, m.author_kind from nestly.support_messages m where m.support_request_id = s.id order by m.created_at desc, m.id desc limit 1) lm on true
  where s.user_id = (select auth.uid()) and exists (select 1 from nestly.support_messages m where m.support_request_id = s.id and m.author_kind = 'support')
  order by lm.created_at desc, s.id limit 100 $q$,
  'select * from nestly.chat_support_threads()', false),
('notifications_latest', $q$
  select n.id, n.type, n.actor_id, n.target_kind, n.target_id, n.created_at, to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), n.read_at
  from nestly.notifications n
  where not (n.type = 'followers_weekly' and (exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
    or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
      and f.created_at >= ((n.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem' and f.created_at < n.created_at)))
  order by n.created_at desc, n.id desc limit 31 $q$,
  'select * from nestly.notifications_latest(31)', false),
('notifications_unread_count', $q$
  select count(*)::int from nestly.notifications n where n.read_at is null
    and not (n.type = 'followers_weekly' and (exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
    or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
      and f.created_at >= ((n.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem' and f.created_at < n.created_at))) $q$,
  'select nestly.notifications_unread_count()', false),
('chat_unread_count', $q$
  select ((select coalesce(sum((select count(*)::int from nestly.messages m where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
            and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity'))), 0)
          from nestly.conversations c)
        + (select coalesce(sum((select count(*)::int from nestly.support_messages m where m.support_request_id = s.id and m.author_kind = 'support'
            and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity'))), 0)
          from nestly.support_requests s where s.user_id = (select auth.uid()))
        + (select count(*) from nestly.chat_requests r where r.target_id = (select auth.uid()) and r.status = 'pending'))::int $q$,
  'select nestly.chat_unread_count()', false),
('regular_names_visible', format($q$ select n.user_id, n.full_name from nestly.regular_names n where n.user_id in (%L, %L, %L, %L) $q$,
    tests.fx_id('a'), tests.fx_id('b'), tests.fx_fr_id('fr_c'), tests.fx_id('p')),
  format($q$ select * from nestly.regular_names_visible(array[%L, %L, %L, %L]::uuid[]) $q$, tests.fx_id('a'), tests.fx_id('b'), tests.fx_fr_id('fr_c'), tests.fx_id('p')), true);

select is(
  (select string_agg(k.label || ' as ' || k.who, ', ' order by k.label, k.who) from (
     select x.label, pe.who from pairs x cross join people pe
     where pg_temp.rows_of(pe.who, x.old_sql, x.sorted) is distinct from pg_temp.rows_of(pe.who, x.new_sql, x.sorted)) k),
  null, '[plan-cache c3] each function returns, row for row, what its statement returns, as a, b, c and p');
select is((select count(*)::int from pairs x cross join people pe where pg_temp.rows_of(pe.who, x.new_sql, x.sorted) like 'ERR:%'), 0,
  '[plan-cache c3] and none of them fails');

-- what the policies do not show is not returned ------------------------------------------------------------------------------
select is(pg_temp.n('a', 'select count(*)::text from nestly.chat_conversations()'), '1', '[plan-cache c4] a lists its conversation with c');
select is(pg_temp.n('c', $q$ select string_agg("lastText" || '/' || unread || '/' || "canSend", ',') from nestly.chat_conversations() $q$), 'שלום קורה/1/true',
  '[plan-cache c4] c lists it too, with a''s message unread');
select is(pg_temp.n('b', 'select count(*)::text from nestly.chat_conversations()'), '0', '[plan-cache c4] b, not a party, does not get it');
select is(pg_temp.n('p', 'select count(*)::text from nestly.chat_conversations()'), '0', '[plan-cache c4] nor does p');
select is(pg_temp.n('a', 'select count(*)::text from nestly.chat_pending_incoming()') || '/' || pg_temp.n('b', 'select count(*)::text from nestly.chat_pending_outgoing()'),
  '1/1', '[plan-cache c4] b''s request is a''s incoming and b''s outgoing');
select is(pg_temp.n('c', 'select count(*)::text from nestly.chat_pending_incoming()') || '/' || pg_temp.n('c', 'select count(*)::text from nestly.chat_pending_outgoing()'),
  '0/0', '[plan-cache c4] c, not a party, gets neither');
select is(pg_temp.n('a', $q$ select string_agg(topic || '/' || "fromSupport" || '/' || unread, ',') from nestly.chat_support_threads() $q$), 'bug/true/1',
  '[plan-cache c4] a lists its answered Support thread');
select is(pg_temp.n('b', 'select count(*)::text from nestly.chat_support_threads()'), '0', '[plan-cache c4] nobody else gets it');
select is(pg_temp.n('a', 'select nestly.chat_unread_count()::text') || '/' || pg_temp.n('c', 'select nestly.chat_unread_count()::text')
  || '/' || pg_temp.n('b', 'select nestly.chat_unread_count()::text'), '2/1/0',
  '[plan-cache c4] the Chat badge: a has b''s request and the Support reply, c a''s message, b nothing');
select is(pg_temp.n('c', $q$ select (select count(*) from nestly.notifications_latest(31))::text || '/' || nestly.notifications_unread_count()::text $q$),
  pg_temp.n('c', 'select count(*)::text || ''/'' || count(*) filter (where read_at is null)::text from nestly.notifications'),
  '[plan-cache c4] c''s list and unread count are its own notifications');
select is(pg_temp.n('c', 'select count(*)::text from nestly.notifications_latest(31) l join nestly.notifications n on n.id = l.id where n.recipient_id <> (select auth.uid())'),
  '0', '[plan-cache c4] and none of anyone else''s');
select ok(pg_temp.n('c', 'select count(*)::text from nestly.notifications_latest(31)')::int > 0, '[plan-cache c4 fixture] c has notifications (b''s Friend Request)');
select is(pg_temp.n('a', 'select count(*)::text from nestly.notifications n where n.type = ''friend_request'''), '0', '[plan-cache c4] a has none of c''s');
select is(pg_temp.n('c', $q$ select count(*)::text from nestly.notifications_latest_before(31, now() + interval '1 day', 'ffffffff-ffff-ffff-ffff-ffffffffffff') $q$),
  pg_temp.n('c', 'select count(*)::text from nestly.notifications_latest(31)'), '[plan-cache c4] the page after a cursor later than all is the first page');
select is(pg_temp.n('c', $q$ select count(*)::text from nestly.notifications_latest_before(31, '-infinity', '00000000-0000-0000-0000-000000000000') $q$), '0',
  '[plan-cache c4] and before the earliest, nothing');
select is(pg_temp.n('c', $q$ select (b.unread = nestly.notifications_unread_count() and b.chat = nestly.chat_unread_count()
    and b.latest is not distinct from (select l.id from nestly.notifications_latest(1) l))::text
  from nestly.notifications_bell_counts(array['friend_request', 'friend_accepted']) b $q$), 'true',
  '[plan-cache c4] the bell''s poll is the list''s unread count, the Chat badge and the newest listed notification');
select is(pg_temp.n('c', $q$ select coalesce(b.latest::text, 'none') from nestly.notifications_bell_counts(array['no_such_type']) b $q$), 'none',
  '[plan-cache c4] a type the build does not know is not the newest');

select * from finish();
rollback;
