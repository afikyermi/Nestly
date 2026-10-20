-- pgTAP, run by pg_prove as app_server (CI `db` job, I8: chat and Support; FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009, BR-011, BR-034,
-- BR-036, BR-042, BR-043, VAL-024..026, AC-024, AC-045, AC-051..053).
-- Source of expected values: the SRS (who opens a conversation, who reads it, Chat Block, the Support thread and its keys), not the migration text.
-- People: a, b, c = fr_c (Regular), s = suspended, p = Professional, m = fr_m (Moderator, no key), v = sf_m1 (SUPPORT_VIEW),
-- h = sf_m2 (SUPPORT_VIEW + SUPPORT_HANDLE), d = fr_d (Admin). a and c are Friends; a and b are not.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I8 fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p') when 's' then tests.fx_id('s')
    when 'c' then tests.fx_fr_id('fr_c') when 'm' then tests.fx_fr_id('fr_m') when 'd' then tests.fx_fr_id('fr_d')
    when 'v' then tests.fx_sf_id('sf_m1') when 'h' then tests.fx_sf_id('sf_m2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.ask(p_by text, p_whom text, p_text text default 'שלום, אפשר לדבר?') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.chat_requests (target_id, opening_message) values (%L, %L) $q$, pg_temp.id(p_whom), p_text))
$f$;
create function pg_temp.answer(p_by text, p_from text, p_status text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ update nestly.chat_requests set status = %L where requester_id = %L and status = 'pending' $q$, p_status, pg_temp.id(p_from)))
$f$;
create function pg_temp.open_conv(p_by text, p_with text, p_context text, p_request uuid default null) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.conversations (context, user_a, user_b, chat_request_id) values (%L, %L, %L, %L) $q$,
    p_context, least(pg_temp.id(p_by), pg_temp.id(p_with)), greatest(pg_temp.id(p_by), pg_temp.id(p_with)), p_request))
$f$;
-- ids are read as a party (app_server reads nothing itself) and remembered, so a later block that hides a row does not lose its id
create temporary table ids (k text primary key, v uuid not null);
create function pg_temp.remember(p_key text, p_who text, p_sql text) returns uuid language plpgsql as $f$
declare v uuid;
begin
  select i.v into v from pg_temp.ids i where i.k = p_key;
  if v is null then
    v := nullif(pg_temp.n(p_who, p_sql), '')::uuid;
    if v is not null then insert into pg_temp.ids values (p_key, v); end if;
  end if;
  return v;
end
$f$;
create function pg_temp.conv(p_x text, p_y text) returns uuid language sql as $f$
  select pg_temp.remember('conv:' || least(p_x, p_y) || greatest(p_x, p_y), p_x,
    format($q$ select id::text from nestly.conversations where user_a = %L and user_b = %L $q$,
      least(pg_temp.id(p_x), pg_temp.id(p_y)), greatest(pg_temp.id(p_x), pg_temp.id(p_y))))
$f$;
create function pg_temp.req(p_from text, p_to text) returns uuid language sql as $f$
  select nullif(pg_temp.n(p_from, format($q$ select id::text from nestly.chat_requests where requester_id = %L and target_id = %L order by created_at desc limit 1 $q$,
    pg_temp.id(p_from), pg_temp.id(p_to))), '')::uuid
$f$;
create function pg_temp.say(p_by text, p_conv uuid, p_text text default 'מה שלומך?') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.messages (conversation_id, body) values (%L, %L) $q$, p_conv, p_text))
$f$;
create function pg_temp.reads(p_who text, p_conv uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.messages where conversation_id = %L $q$, p_conv))
$f$;
create function pg_temp.chat_block(p_by text, p_whom text, p_type text default 'regular') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.chat_blocks (blocked_id, blocked_account_type) values (%L, %L) $q$, pg_temp.id(p_whom), p_type))
$f$;
create function pg_temp.chat_unblock(p_by text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ update nestly.chat_blocks set lifted_at = now() where blocked_id = %L and lifted_at is null $q$, pg_temp.id(p_whom)))
$f$;
create function pg_temp.support(p_by text, p_topic text default 'bug', p_text text default 'הכפתור לא עובד') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.support_requests (topic, body) values (%L, %L) $q$, p_topic, p_text))
$f$;
create function pg_temp.sreq(p_by text) returns uuid language sql as $f$
  select pg_temp.remember('sreq:' || p_by, p_by, 'select id::text from nestly.support_requests order by created_at, id limit 1')
$f$;
create function pg_temp.sreply(p_by text, p_req uuid, p_text text default 'תודה, בודקים', p_internal boolean default false) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.support_messages (support_request_id, body, is_internal) values (%L, %L, %L) $q$, p_req, p_text, p_internal))
$f$;

select tests.fx_sf_grant(pg_temp.id('v'), array['SUPPORT_VIEW']);
select tests.fx_sf_grant(pg_temp.id('h'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE']);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')
            and c.relrowsecurity and c.relforcerowsecurity), 7::bigint, '[I8 c1] the seven new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')),
  'chat_blocks.chat_blocks_insert_blocker:a, chat_blocks.chat_blocks_select_party:r, chat_blocks.chat_blocks_update_blocker:w, '
  || 'chat_reads.chat_reads_insert_own:a, chat_reads.chat_reads_select_own:r, chat_reads.chat_reads_update_own:w, '
  || 'chat_requests.chat_requests_insert_requester:a, chat_requests.chat_requests_select_party:r, chat_requests.chat_requests_update_target:w, '
  || 'conversations.conversations_insert_party:a, conversations.conversations_select_party:r, '
  || 'messages.messages_insert_party:a, messages.messages_select_party:r, '
  || 'support_messages.support_messages_insert_own:a, support_messages.support_messages_insert_staff:a, support_messages.support_messages_select_own:r, support_messages.support_messages_select_staff:r, '
  || 'support_requests.support_requests_insert_own:a, support_requests.support_requests_select_own:r, support_requests.support_requests_select_staff:r, support_requests.support_requests_update_staff:w',
  '[I8 c1] exactly these policies: no DELETE anywhere, no UPDATE of a conversation, a message or a Support message');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')
            and (pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] or not pl.polpermissive
                 or (coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '')) !~ 'is_active_account\(\)')),
  0::bigint, '[I8 c1 platform r15] every policy of the new tables is permissive, TO authenticated and gated by is_active_account()');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')
              and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'chat_blocks.blocked_account_type, chat_blocks.blocked_id, chat_reads.conversation_id, chat_reads.support_request_id, chat_requests.opening_message, chat_requests.target_id, '
  || 'conversations.chat_request_id, conversations.context, conversations.user_a, conversations.user_b, messages.body, messages.conversation_id, '
  || 'support_messages.body, support_messages.is_internal, support_messages.support_request_id, support_requests.body, support_requests.topic',
  '[I8 c1 conventions] INSERT per column: never an owner column, a status, a clock or the author kind');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')
              and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'chat_blocks.lifted_at, chat_reads.last_read_at, chat_requests.status, support_requests.status',
  '[I8 c1] UPDATE only of a lift, a read marker and two statuses');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname ~ '^(chat_|support_|conversation|message)'), 0::bigint, '[I8 c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('chat_requests', 'conversations', 'messages', 'chat_blocks', 'chat_reads', 'support_requests', 'support_messages')
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', c.oid, 'DELETE,TRUNCATE'))),
  0::bigint, '[I8 c1] anon holds nothing; authenticated deletes nothing');

-- ---- Friends chat directly (FR-CHAT-002, VAL-024, AC-045) -------------------------------------------------------------------
select is(pg_temp.open_conv('a', 'c', 'friends'), 'OK:1', '[I8 c2 AC-045] Friends open a conversation directly');
select is(pg_temp.open_conv('c', 'a', 'friends'), 'ERR:23505', '[I8 c2] one conversation per pair');
select is(pg_temp.open_conv('a', 'b', 'friends'), 'ERR:42501', '[I8 c2 ERR-021] non-Friends cannot open a direct conversation');
select is(pg_temp.dml('b', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('friends', %L, %L) $q$,
    least(pg_temp.id('a'), pg_temp.id('c')), greatest(pg_temp.id('a'), pg_temp.id('c')))), 'ERR:42501', '[I8 c2] nobody opens a conversation between two others');
select is(pg_temp.say('a', pg_temp.conv('a', 'c')), 'OK:1', '[I8 c2] a party sends');
select is(pg_temp.say('c', pg_temp.conv('a', 'c'), 'הכל טוב'), 'OK:1', '[I8 c2] so does the other party');
select is(pg_temp.reads('a', pg_temp.conv('a', 'c')) || '/' || pg_temp.reads('c', pg_temp.conv('a', 'c')), '2/2', '[I8 c2] both parties read the thread');
select is(pg_temp.reads('b', pg_temp.conv('a', 'c')), '0', '[I8 c2] a third account reads none of it');
select is(pg_temp.reads('d', pg_temp.conv('a', 'c')) || '/' || pg_temp.reads('h', pg_temp.conv('a', 'c')), '0/0', '[I8 c2 BR-034] staff, the Admin included, never read a conversation');
select is(pg_temp.say('b', pg_temp.conv('a', 'c')), 'ERR:42501', '[I8 c2] a third account cannot write into it');
select is(pg_temp.dml('a', format($q$ insert into nestly.messages (conversation_id, sender_id, body) values (%L, %L, 'x') $q$, pg_temp.conv('a', 'c'), pg_temp.id('c'))),
  'ERR:42501', '[I8 c2] nobody sends in another''s name');
select is(pg_temp.say('a', pg_temp.conv('a', 'c'), repeat('א', 2001)), 'ERR:23514', '[I8 c2] a message is at most 2000 characters');
select is(pg_temp.say('a', pg_temp.conv('a', 'c'), '   '), 'ERR:23514', '[I8 c2] and never blank');
select is(pg_temp.dml('a', 'update nestly.messages set body = ''x'''), 'ERR:42501', '[I8 c2] a message is never edited');
select is(pg_temp.dml('a', 'delete from nestly.messages'), 'ERR:42501', '[I8 c2] nor deleted');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'removed' where id = %L $q$, tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('c')))),
  'OK:1', '[I8 c2 fixture] a removes c as a Friend');
select is(pg_temp.say('c', pg_temp.conv('a', 'c'), 'עדיין כאן'), 'OK:1', '[I8 c2 BR-042 AC-045] the conversation continues after Remove Friend');

-- ---- Regular Chat Request (FR-CHAT-003, VAL-025, AC-051) --------------------------------------------------------------------
select is(pg_temp.ask('a', 'c'), 'ERR:42501', '[I8 c3 VAL-025] no request where a conversation already exists');
select is(pg_temp.ask('a', 'p'), 'ERR:23503', '[I8 c3] a request goes to a Regular account only');
select is(pg_temp.ask('p', 'a'), 'ERR:23503', '[I8 c3] and comes from one');
select is(pg_temp.ask('a', 's'), 'ERR:23503', '[I8 c3] never to a suspended account (only an active one)');
select is(pg_temp.ask('a', 'a'), 'ERR:23514', '[I8 c3] never to oneself');
select is(pg_temp.ask('a', 'b', repeat('א', 2001)), 'ERR:23514', '[I8 c3] the opening message is at most 2000 characters');
select is(pg_temp.ask('a', 'b'), 'OK:1', '[I8 c3 AC-051] a Regular asks a Regular who is not a Friend');
select is(pg_temp.ask('a', 'b'), 'ERR:23505', '[I8 c3] one live request per pair');
select is(pg_temp.ask('b', 'a'), 'ERR:23505', '[I8 c3] in either direction');
select is(pg_temp.n('b', 'select count(*)::text from nestly.chat_requests'), '1', '[I8 c3] the target reads it');
select is(pg_temp.n('c', 'select count(*)::text from nestly.chat_requests'), '0', '[I8 c3] a third account does not');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))), '1', '[I8 c3] the target reads the requester''s name');
select is(pg_temp.open_conv('a', 'b', 'request', pg_temp.req('a', 'b')), 'ERR:42501', '[I8 c3 AC-051] without an accept no conversation opens');
select is(pg_temp.answer('a', 'a', 'accepted'), 'OK:0', '[I8 c3] the requester cannot accept its own request');
select is(pg_temp.answer('b', 'a', 'accepted'), 'OK:1', '[I8 c3 AC-051] the target accepts');
select is(pg_temp.open_conv('b', 'a', 'request', pg_temp.req('a', 'b')), 'OK:1', '[I8 c3] the accepted request opens the conversation');
select is(pg_temp.answer('b', 'a', 'declined'), 'OK:0', '[I8 c3] an answered request is not answered again');
select is(pg_temp.dml('b', format($q$ update nestly.chat_requests set status = 'pending' where id = %L $q$, pg_temp.req('a', 'b'))), 'ERR:42501', '[I8 c3] nor reopened');
select is(pg_temp.say('a', pg_temp.conv('a', 'b')), 'OK:1', '[I8 c3] both now write');
select is(pg_temp.n('c', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('b'))), '0', '[I8 c3] a third account still reads no name');
-- a decline: c asks b, b declines; c cannot ask b again, b can ask c
select is(pg_temp.ask('c', 'b'), 'OK:1', '[I8 c3 fixture] c asks b');
select is(pg_temp.answer('b', 'c', 'declined'), 'OK:1', '[I8 c3] the target declines');
select is(pg_temp.open_conv('b', 'c', 'request', pg_temp.req('c', 'b')), 'ERR:42501', '[I8 c3 ERR-007] a declined request opens nothing');
select is(pg_temp.ask('c', 'b'), 'ERR:NS024', '[I8 c3] after a decline the same requester cannot ask again');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('c'))), '0', '[I8 c3] a declined requester''s name is no longer shown to the target');

-- ---- Chat Block (FR-SERV-009, BR-011, ERR-008, AC-052) ----------------------------------------------------------------------
select is(pg_temp.chat_block('b', 'a'), 'OK:1', '[I8 c4 FR-SERV-009] b blocks messaging from a');
select is(pg_temp.say('a', pg_temp.conv('a', 'b')), 'ERR:42501', '[I8 c4 ERR-008] a can no longer send');
select is(pg_temp.say('b', pg_temp.conv('a', 'b')), 'ERR:42501', '[I8 c4] nor can b, while its block stands');
select is(pg_temp.reads('a', pg_temp.conv('a', 'b')), '1', '[I8 c4 AC-052] the history stays readable');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))), '1', '[I8 c4 AC-052] a Chat Block hides no one: b still reads a''s name');
select is(pg_temp.chat_block('b', 'a'), 'ERR:23505', '[I8 c4] one standing Chat Block per pair and direction');
select is(pg_temp.chat_block('b', 'm', 'regular'), 'ERR:23503', '[I8 c4] a staff account is never Chat-blocked');
select is(pg_temp.chat_block('m', 'a'), 'ERR:42501', '[I8 c4 BR-034] staff do not Chat-block');
select is(pg_temp.chat_unblock('a', 'b'), 'OK:0', '[I8 c4] the blocked side cannot lift it');
select is(pg_temp.dml('b', 'delete from nestly.chat_blocks'), 'ERR:42501', '[I8 c4] a Chat Block is never deleted');
select is(pg_temp.chat_unblock('b', 'a'), 'OK:1', '[I8 c4 FR-SERV-009] the blocker lifts it');
select is(pg_temp.say('a', pg_temp.conv('a', 'b'), 'שוב כאן'), 'OK:1', '[I8 c4] messaging is back');
select is(pg_temp.chat_block('c', 'b'), 'OK:1', '[I8 c4 fixture] c Chat-blocks b');
select is(pg_temp.ask('b', 'c'), 'ERR:42501', '[I8 c4 ERR-008] no request across a Chat Block');
select is(pg_temp.chat_unblock('c', 'b'), 'OK:1', '[I8 c4 fixture] c lifts it');
select is(pg_temp.ask('b', 'c'), 'OK:1', '[I8 c4] the other direction of a decline may still ask');
select is(pg_temp.chat_block('b', 'c'), 'OK:1', '[I8 c4 fixture] b Chat-blocks c, with b''s request to c pending');
select is(pg_temp.answer('c', 'b', 'accepted'), 'ERR:42501', '[I8 c4] a request is not accepted across a Chat Block');
select is(pg_temp.answer('c', 'b', 'declined'), 'OK:1', '[I8 c4] but it can be declined');

-- ---- user blocks (FR-REL-002) reach the chat ------------------------------------------------------------------------------
select is(pg_temp.dml('a', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('b'))), 'OK:1',
  '[I8 c5 fixture] a blocks b (FR-REL-002)');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.conversations where id = %L $q$, pg_temp.conv('a', 'b'))) || '/'
       || pg_temp.n('b', format($q$ select count(*)::text from nestly.conversations where id = %L $q$, pg_temp.conv('a', 'b'))), '0/0',
  '[I8 c5] the conversation is hidden from both while the user block stands');
select is(pg_temp.reads('b', pg_temp.conv('a', 'b')), '0', '[I8 c5] and so are its messages');
select is(pg_temp.say('b', pg_temp.conv('a', 'b')), 'ERR:42501', '[I8 c5] nobody sends across a user block');
select is(pg_temp.n('b', 'select count(*)::text from nestly.chat_requests where requester_id = ' || quote_literal(pg_temp.id('a'))), '0', '[I8 c5] nor sees the other''s requests');
select is(pg_temp.dml('a', format($q$ update nestly.user_blocks set lifted_at = now() where blocked_id = %L $q$, pg_temp.id('b'))), 'OK:1', '[I8 c5 fixture] a lifts the block');
select is(pg_temp.reads('b', pg_temp.conv('a', 'b')), '2', '[I8 c5] after the lift the conversation is back');

-- ---- suspension ----------------------------------------------------------------------------------------------------------
select is(pg_temp.n('s', 'select count(*)::text from nestly.messages'), '0', '[I8 c6 platform r15] a suspended account reads no message');
select is(pg_temp.support('s'), 'ERR:42501', '[I8 c6] nor sends a Support request');

-- ---- read markers --------------------------------------------------------------------------------------------------------
select is(pg_temp.dml('a', format($q$ insert into nestly.chat_reads (conversation_id) values (%L) $q$, pg_temp.conv('a', 'c'))), 'OK:1', '[I8 c7 FR-CHAT-001] a party marks a conversation read');
select is(pg_temp.dml('b', format($q$ insert into nestly.chat_reads (conversation_id) values (%L) $q$, pg_temp.conv('a', 'c'))), 'ERR:42501', '[I8 c7] never for a conversation it is not part of');
select is(pg_temp.n('c', 'select count(*)::text from nestly.chat_reads'), '0', '[I8 c7] a marker is its owner''s only');
select is(pg_temp.dml('a', format($q$ update nestly.chat_reads set last_read_at = '2000-01-01' where conversation_id = %L $q$, pg_temp.conv('a', 'c'))), 'OK:1', '[I8 c7] the owner moves it');
select is(pg_temp.n('a', 'select (min(last_read_at) > now() - interval ''1 minute'')::text from nestly.chat_reads'), 'true', '[I8 c7] to the database clock, whatever the client sent');

-- ---- Support (FR-ADMIN-001/002, FR-CHAT-004, VAL-026, AC-024, AC-053) ------------------------------------------------------
select is(pg_temp.support('a'), 'OK:1', '[I8 c8 FR-ADMIN-001] a Regular sends a Support request');
select is(pg_temp.support('p', 'account', 'שאלה על החשבון'), 'OK:1', '[I8 c8] so does a Professional');
select is(pg_temp.support('m'), 'ERR:42501', '[I8 c8 BR-034] staff send none');
select is(pg_temp.support('a', 'no_such_topic'), 'ERR:23514', '[I8 c8] the topic comes from the list');
select is(pg_temp.support('a', 'bug', repeat('א', 2001)), 'ERR:23514', '[I8 c8] the text is at most 2000 characters');
select is(pg_temp.dml('a', format($q$ insert into nestly.support_requests (user_id, topic, body) values (%L, 'bug', 'x') $q$, pg_temp.id('b'))), 'ERR:42501', '[I8 c8] never in another''s name');
select is(pg_temp.dml('a', $q$ insert into nestly.support_requests (topic, body, status) values ('bug', 'x', 'closed') $q$), 'ERR:42501', '[I8 c8] never with a status');
select is(pg_temp.n('a', 'select count(*)::text from nestly.support_requests'), '1', '[I8 c8] the user reads its own request');
select is(pg_temp.n('b', 'select count(*)::text from nestly.support_requests'), '0', '[I8 c8] and nobody else''s');
select is(pg_temp.n('m', 'select count(*)::text from nestly.support_requests'), '0', '[I8 c8 AC-024] a Moderator without SUPPORT_VIEW reads none');
select is(pg_temp.n('v', 'select count(*)::text from nestly.support_requests'), '2', '[I8 c8 AC-024] SUPPORT_VIEW reads every request');
select is(pg_temp.n('d', 'select count(*)::text from nestly.support_requests'), '2', '[I8 c8 AC-024] the Admin reads every request');
select is(pg_temp.sreply('v', pg_temp.sreq('a')), 'ERR:42501', '[I8 c8 AC-024] SUPPORT_VIEW alone cannot reply');
select is(pg_temp.dml('v', format($q$ update nestly.support_requests set status = 'closed' where id = %L $q$, pg_temp.sreq('a'))), 'OK:0', '[I8 c8 AC-024] nor change the status');
select is(pg_temp.sreply('h', pg_temp.sreq('a')), 'OK:1', '[I8 c8 AC-024 AC-053] SUPPORT_HANDLE replies');
select is(tests.fx_sf_audit('support_replied'), 1::bigint, '[I8 c8 FR-ADMIN-002] the reply is an Audit Log entry');
select is(pg_temp.sreply('h', pg_temp.sreq('a'), 'נראה כמו באג ידוע', true), 'OK:1', '[I8 c8 FR-ADMIN-002] and adds an internal note');
select is(tests.fx_sf_audit('support_note_added'), 1::bigint, '[I8 c8] the note is audited too');
select is(pg_temp.sreply('d', pg_temp.sreq('a'), 'עוד פרט'), 'OK:1', '[I8 c8 AC-024] the Admin replies');
select is(pg_temp.n('a', format($q$ select string_agg(author_kind, ',' order by created_at) from nestly.support_messages where support_request_id = %L $q$, pg_temp.sreq('a'))),
  'support,support', '[I8 c8 AC-053 BR-043] the user reads the replies as Support, never the internal note');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname = 'support_messages' and a.attnum > 0 and not a.attisdropped and a.attname ~ '(author_id|staff|handled_by|sender)'), 0::bigint,
  '[I8 c8 FR-CHAT-004] a Support message stores no staff identity (the reply never reveals who wrote it)');
select is(pg_temp.n('v', format($q$ select count(*)::text from nestly.support_messages where support_request_id = %L $q$, pg_temp.sreq('a'))), '3', '[I8 c8] staff read the whole thread, the note included');
select is(pg_temp.sreply('a', pg_temp.sreq('a'), 'עדיין לא עובד'), 'OK:1', '[I8 c8 FR-CHAT-004] the user replies in its thread');
select is(pg_temp.n('h', format($q$ select author_kind from nestly.support_messages where body = 'עדיין לא עובד' $q$)), 'user', '[I8 c8] as the user');
select is(pg_temp.sreply('a', pg_temp.sreq('a'), 'פתק', true), 'ERR:42501', '[I8 c8] the user writes no internal note');
select is(pg_temp.sreply('b', pg_temp.sreq('a')), 'ERR:42501', '[I8 c8 VAL-026] nobody writes into another''s thread');
select is(pg_temp.dml('a', format($q$ insert into nestly.chat_reads (support_request_id) values (%L) $q$, pg_temp.sreq('a'))), 'OK:1', '[I8 c8] the user marks its Support thread read');
select is(pg_temp.dml('b', format($q$ insert into nestly.chat_reads (support_request_id) values (%L) $q$, pg_temp.sreq('a'))), 'ERR:42501', '[I8 c8] nobody else does');
select is(pg_temp.dml('h', format($q$ update nestly.support_requests set status = 'closed' where id = %L $q$, pg_temp.sreq('a'))), 'OK:1', '[I8 c8 FR-ADMIN-002] SUPPORT_HANDLE closes the request');
select is(tests.fx_sf_audit('support_status_changed'), 1::bigint, '[I8 c8] the status change is audited');
select is(pg_temp.n('a', format($q$ select status || ':' || (closed_at is not null)::text from nestly.support_requests where id = %L $q$, pg_temp.sreq('a'))), 'closed:true', '[I8 c8] the user sees it closed');
select is(pg_temp.sreply('a', pg_temp.sreq('a'), 'עוד משהו'), 'ERR:42501', '[I8 c8 FR-CHAT-004] a closed request takes no reply from the user');
select is(pg_temp.sreply('h', pg_temp.sreq('a'), 'עוד משהו'), 'ERR:42501', '[I8 c8] nor from Support');
select is(pg_temp.sreply('h', pg_temp.sreq('a'), 'נסגר כי טופל', true), 'OK:1', '[I8 c8] an internal note still can');
select is(pg_temp.dml('h', format($q$ update nestly.support_requests set body = 'x' where id = %L $q$, pg_temp.sreq('a'))), 'ERR:42501', '[I8 c8] the request text is never changed');
select is(pg_temp.dml('a', format($q$ update nestly.support_requests set status = 'open' where id = %L $q$, pg_temp.sreq('a'))), 'OK:0', '[I8 c8] the user cannot reopen it');
select is(pg_temp.dml('h', 'delete from nestly.support_requests'), 'ERR:42501', '[I8 c8] a request is never deleted');
select is(pg_temp.support('a', 'usage') || pg_temp.support('a', 'usage') || pg_temp.support('a', 'usage') || pg_temp.support('a', 'usage'), 'OK:1OK:1OK:1OK:1',
  '[I8 c8 fixture] a sends its 2nd to 5th request of the day');
select is(pg_temp.support('a', 'usage'), 'ERR:NS023', '[I8 c8] the 6th within 24 hours is refused');
-- the names on the Support inbox, on the admin screens only
select is(pg_temp.n('v', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))), '0', '[I8 c8 NFR-SEC-006] outside the inbox staff read no name');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('v')),
    format($q$ select set_config('nestly.staff_view', 'on', true) || (select count(*)::text from nestly.regular_names where user_id = %L) $q$, pg_temp.id('a'))),
  'on1', '[I8 c8 FR-ADMIN-002] on the inbox SUPPORT_VIEW reads the name of a request''s author');

select * from finish();
rollback;
