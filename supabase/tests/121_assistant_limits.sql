-- pgTAP, run by pg_prove as app_server (CI `db` job): the Nestly assistant's per-account message limits (migration 20261028100000,
-- Afik 28.10.2026). Expected values come from the SRS: BR-092 (20 messages an hour, 60 a day, per account; the conversation is never
-- stored) and NFR-PRIV-008 (nothing of the conversation is kept). The thresholds are the server's configuration; this file checks who may
-- read and write the counter row.
-- People (file 90's): a, b (Regular), p (Professional), s (suspended), d = fr_d (Admin). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F15.1-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'd' then tests.fx_fr_id('fr_d')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), 'nestly.assistant_message_counts')
$f$;

-- 1. The table: RLS forced, owned by app_owner, no grant to anon, only the three own-row policies (rules 1, 8)
select is(
  (select c.relrowsecurity::text || '/' || c.relforcerowsecurity::text || '/' || pg_catalog.pg_get_userbyid(c.relowner)
     from pg_catalog.pg_class c where c.relname = 'assistant_message_counts' and c.relnamespace = 'nestly'::regnamespace),
  'true/true/app_owner', '[BR-092 rule 8] nestly.assistant_message_counts exists, owned by app_owner, with RLS enabled and forced');
select is(
  (select string_agg(r || ':' || pr || ':' || has_any_column_privilege(r, c.oid, pr)::text || ':' || has_table_privilege(r, c.oid, 'DELETE')::text, ', ' order by r, pr)
     from pg_catalog.pg_class c, unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE']) pr
    where c.relname = 'assistant_message_counts' and c.relnamespace = 'nestly'::regnamespace),
  'anon:INSERT:false:false, anon:SELECT:false:false, anon:UPDATE:false:false, authenticated:INSERT:true:false, authenticated:SELECT:true:false, authenticated:UPDATE:true:false',
  '[BR-092 rule 1] anon holds nothing; authenticated selects, inserts and updates (its own row, below) and never deletes');
select is(
  (select string_agg(a.attname || ':' || has_column_privilege('authenticated', c.oid, a.attname, 'INSERT')::text || ':' || has_column_privilege('authenticated', c.oid, a.attname, 'UPDATE')::text, ', ' order by a.attnum)
     from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relname = 'assistant_message_counts' and c.relnamespace = 'nestly'::regnamespace),
  'user_id:true:false, sent_at:false:true', '[BR-092] INSERT names the account only; UPDATE changes the instants only');
select is(
  (select string_agg(x, ', ' order by x)
     from (select (pol.polname::text || '.' || pol.polcmd::text || '.'
                   || pg_catalog.array_to_string(array(select pg_catalog.pg_get_userbyid(u)::text from unnest(pol.polroles) u), ',')) collate "C" as x
             from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
            where c.relname = 'assistant_message_counts' and c.relnamespace = 'nestly'::regnamespace) p),
  'assistant_message_counts_insert_own.a.authenticated, assistant_message_counts_select_own.r.authenticated, assistant_message_counts_update_own.w.authenticated',
  '[BR-092] exactly three policies, all TO authenticated');
select is(
  (select string_agg(a.attname, ', ' order by a.attnum) from pg_catalog.pg_attribute a
    where a.attrelid = (select c.oid from pg_catalog.pg_class c where c.relname = 'assistant_message_counts' and c.relnamespace = 'nestly'::regnamespace)
      and a.attnum > 0 and not a.attisdropped),
  'user_id, sent_at', '[NFR-PRIV-008] the row holds the account and the instants only: no text, no answer, no topic');

-- 2. The owner counts its own messages: a Regular and a Professional account
select is(pg_temp.dml('a', $q$ insert into nestly.assistant_message_counts as c (user_id) values (auth.uid())
                               on conflict (user_id) do update set sent_at = c.sent_at $q$), 'OK:1', '[BR-092] a Regular account creates its own counter row');
select is(pg_temp.dml('a', $q$ update nestly.assistant_message_counts set sent_at = array[now()] where user_id = auth.uid() $q$), 'OK:1',
  '[BR-092] and records an accepted message in it');
select is(pg_temp.n('a'), '1', '[BR-092] the owner reads its own row');
select is(pg_temp.dml('a', $q$ insert into nestly.assistant_message_counts as c (user_id) values (auth.uid())
                               on conflict (user_id) do update set sent_at = c.sent_at $q$), 'OK:1', '[BR-092] the second count of the same account updates the same row (the lock the server decides under)');
select is(pg_temp.dml('p', $q$ insert into nestly.assistant_message_counts (user_id) values (auth.uid()) $q$), 'OK:1', '[BR-092] a Professional account counts too');

-- 3. Nobody else: not another account's row, not staff, not a suspended account
select is(pg_temp.n('b'), '0', '[BR-092] another account reads no one else''s counter');
select is(pg_temp.dml('b', $q$ update nestly.assistant_message_counts set sent_at = '{}' $q$), 'OK:0', '[BR-092] nor resets it');
select is(pg_temp.dml('b', format($q$ insert into nestly.assistant_message_counts (user_id) values (%L) $q$, pg_temp.id('a'))), 'ERR:42501',
  '[BR-092 rule 12] nor writes a row on behalf of another account');
select is(pg_temp.dml('a', $q$ update nestly.assistant_message_counts set user_id = gen_random_uuid() $q$), 'ERR:42501', '[BR-092] the account of a row never changes');
select is(pg_temp.dml('a', $q$ delete from nestly.assistant_message_counts $q$), 'ERR:42501', '[BR-092] the client never deletes the row');
select is(pg_temp.dml('d', $q$ insert into nestly.assistant_message_counts (user_id) values (auth.uid()) $q$), 'ERR:42501', '[assistant: Regular and Professional only] an Admin account has no assistant');
select is(pg_temp.dml('s', $q$ insert into nestly.assistant_message_counts (user_id) values (auth.uid()) $q$), 'ERR:42501', '[platform r15] a suspended account counts nothing');

-- 4. The size guard and the cascade
select is(pg_temp.dml('a', $q$ update nestly.assistant_message_counts set sent_at = array(select now() from generate_series(1, 1001)) where user_id = auth.uid() $q$),
  'ERR:23514', '[BR-092] the array never grows past 1,000 instants');
select is(
  (select c.confdeltype::text from pg_catalog.pg_constraint c where c.conname = 'assistant_message_counts_user_id_fkey'),
  'c', '[I9] the row cascades with the account');

select * from finish();
rollback;
