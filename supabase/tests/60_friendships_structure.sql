-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.4a: friends, FR-REL-001, VAL-017, BR-029, AC-034).
-- Structure of nestly.friendships and nestly.regular_names: columns, constraints, indexes, RLS, grants, policies, functions
-- (spec criterion c12; c1-c3, c9 in their structural parts). Behaviour of the policies and the trigger is in files 61 and 62.
-- Source of expected values: .work/friends/schema.md ("Migration", "Authorization"), not the migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast would fail.
-- no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.4-a c12] session_user is app_server (this file must not run under another login)');

-- ---- friendships: exactly the approved columns ----------------------------------------------------------------------------------
select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'addressee_id:uuid:nn, addressee_status:text:nn, cancelled_at:timestamp with time zone:null, created_at:timestamp with time zone:nn, '
  || 'id:uuid:nn, removed_at:timestamp with time zone:null, requested_at:timestamp with time zone:nn, requester_id:uuid:nn, '
  || 'requester_status:text:nn, responded_at:timestamp with time zone:null, status:text:nn',
  '[F2.4-a c12] friendships has exactly the approved columns and nothing that can hold a message, an email or a profile field');

select is(
  (select string_agg(a.attname || '=' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), ', ' order by a.attname)
     from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships'),
  'addressee_status=''active''::text, created_at=now(), id=gen_random_uuid(), requested_at=now(), requester_id=auth.uid(), '
  || 'requester_status=''active''::text, status=''pending''::text',
  '[F2.4-a c1 c12 platform r12 r13] the database sets the requester (auth.uid()), the id, the status and the clocks; the client sets only the addressee');

-- ---- constraints ------------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(co.conname || ':' || co.contype::text, ', ' order by co.conname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and co.contype in ('p', 'c', 'f', 'u')),
  'friendships_addressee_id_check:c, friendships_addressee_id_fkey:f, friendships_addressee_status_fkey:f, friendships_cancelled_at_check:c, '
  || 'friendships_pkey:p, friendships_removed_at_check:c, friendships_requester_id_fkey:f, friendships_requester_status_fkey:f, '
  || 'friendships_responded_at_check:c, friendships_status_check:c',
  '[F2.4-a c2 c9 c12] friendships has exactly the primary key, the four CHECKs and the four foreign keys');

select is(
  (select string_agg(co.conname || ':' || pg_catalog.pg_get_constraintdef(co.oid), ' | ' order by co.conname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and co.contype = 'f'),
  'friendships_addressee_id_fkey:FOREIGN KEY (addressee_id) REFERENCES nestly.regular_profiles(user_id) ON DELETE CASCADE | '
  || 'friendships_addressee_status_fkey:FOREIGN KEY (addressee_id, addressee_status) REFERENCES nestly.users(id, status) ON UPDATE CASCADE ON DELETE CASCADE | '
  || 'friendships_requester_id_fkey:FOREIGN KEY (requester_id) REFERENCES nestly.regular_profiles(user_id) ON DELETE CASCADE | '
  || 'friendships_requester_status_fkey:FOREIGN KEY (requester_id, requester_status) REFERENCES nestly.users(id, status) ON UPDATE CASCADE ON DELETE CASCADE',
  '[F2.4-a c2 c10] both parties are Regular profiles (FK), and each carries a copy of its users.status that follows it (ON UPDATE CASCADE)');

select is(
  (select string_agg(co.conname || ':' || pg_catalog.pg_get_constraintdef(co.oid), ' | ' order by co.conname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and co.conname = 'friendships_status_check'),
  'friendships_status_check:CHECK ((status = ANY (ARRAY[''pending''::text, ''accepted''::text, ''declined''::text, ''removed''::text])))',
  '[F2.4-a c9] status is exactly pending, accepted, declined or removed (§13); cancel is no status (DR-4 A)');

select is(
  (select string_agg(i.indexname, ', ' order by i.indexname) from pg_catalog.pg_indexes i
    where i.schemaname = 'nestly' and i.tablename = 'friendships'),
  'friendships_addressee_id_idx, friendships_pair_live_key, friendships_pkey, friendships_requester_id_addressee_id_key, friendships_requester_id_idx',
  '[F2.4-a c3 c4] friendships has exactly its pkey, the two list indexes and the two unique partial indexes');

select is(
  (select count(*) from pg_catalog.pg_index x join pg_catalog.pg_class c on c.oid = x.indrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_class ic on ic.oid = x.indexrelid
    where n.nspname = 'nestly' and c.relname = 'friendships' and ic.relname in ('friendships_pair_live_key', 'friendships_requester_id_addressee_id_key')
      and x.indisunique and x.indpred is not null),
  2::bigint,
  '[F2.4-a c3 c4] the pair index and the directional index are UNIQUE and partial: at most one live row per unordered pair, a decline blocks only its own direction');

select ok(
  (select pg_catalog.pg_get_indexdef(ic.oid) ~ 'LEAST\(requester_id, addressee_id\), GREATEST\(requester_id, addressee_id\)'
     from pg_catalog.pg_class ic join pg_catalog.pg_namespace n on n.oid = ic.relnamespace
    where n.nspname = 'nestly' and ic.relname = 'friendships_pair_live_key'),
  '[F2.4-a c3 c4] friendships_pair_live_key is over the unordered pair (least, greatest), so A->B and B->A collide');

-- ---- RLS on and forced; exactly the approved policies ---------------------------------------------------------------------------
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('friendships', 'regular_names')),
  'friendships:true:true, regular_names:true:true',
  '[F2.4-a c12 platform r8] friendships and regular_names have RLS enabled and forced');

select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('friendships', 'regular_names') $$,
  $$ values ('friendships.friendships_select_party.r'), ('friendships.friendships_insert_requester.a'), ('friendships.friendships_update_party.w'),
            ('regular_names.regular_names_select_party.r'), ('regular_names.regular_names_insert_own.a'),
            ('regular_names.regular_names_select_post_reader.r'), ('regular_names.regular_names_select_comment_reader.r'),
            ('friendships.friendships_select_profile_view.r'), ('regular_names.regular_names_select_profile_view.r'),
            ('regular_names.regular_names_select_staff.r'), ('regular_names.regular_names_select_reveal.r'),
            ('friendships.friendships_select_notify.r'), ('regular_names.regular_names_select_search.r'),
            ('friendships.friendships_block_insert.a'), ('friendships.friendships_block_update.w'),
            ('regular_names.regular_names_block_hide.r'), ('regular_names.regular_names_select_blocker.r'),
            ('regular_names.regular_names_select_conversation.r'), ('regular_names.regular_names_select_request_sent.r'),
            ('regular_names.regular_names_select_request_received.r'), ('regular_names.regular_names_select_support.r'),
            ('friendships.friendships_select_analytics.r'),
            ('regular_names.regular_names_select_group_member.r'), ('regular_names.regular_names_select_group_requester.r'),
            ('regular_names.regular_names_select_group_banned.r') $$,
  '[F2.4-a c12 · F2.4-c c18 c23 · I4 · I8 · I14] exactly twenty-five policies (I10 adds the three group name reads, file 96; I14 adds friendships_select_analytics, counts on the analytics screen only, file 95; I8 adds the three chat name reads and the Support name read, file 94; blocking adds three restrictive ones and the blocker''s read of its blocked list, file 91; I4 adds regular_names_select_staff and regular_names_select_reveal, file 90; the notifications add friendships_select_notify and regular_names_select_search TO app_owner, file 90); of the first nine: friendships select, insert, update (no delete) and regular_names select, insert -- five TO authenticated -- from F2.4c1 one SELECT each for profile_view TO app_owner (file 64) -- and, from F3.2 (6b), regular_names_select_post_reader (file 79) and, from F3.4 N1 (Q7 B), regular_names_select_comment_reader (file 81)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('friendships', 'regular_names')
      and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]),
  20::bigint,
  '[F2.4-a c12 · F2.4-c c23 · F3.2 6b · I4 · I14 · I10] twenty of the policies are TO authenticated (I10: the three group name reads, file 96; I14: friendships_select_analytics, file 95; I8: the three chat name reads and the Support name read, file 94; blocking: three restrictive ones and regular_names_select_blocker, file 91; I4: the staff read; the reveal read is TO app_owner) (the five, the F3.2 post-reader and the F3.4 comment-reader policy) and nothing else, the other two (F2.4c1) TO app_owner only: no public or anon policy');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('friendships', 'regular_names')
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ 'is_active_account\(\)'),
  17::bigint,
  '[F2.4-a c10 c12 platform r15] every permissive TO authenticated policy (seventeen with I10''s three group name reads; seven since F3.4 N1, eight with I4''s staff read, nine with the blocker''s read, thirteen with I8''s four, fourteen with I14''s analytics read) is gated by is_active_account(): a suspended or banned account sees and writes nothing (the restrictive block policies only narrow them, file 91)');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'requester_id = \( SELECT auth\.uid\(\)'
     and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'status = ''pending''::text'
     and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'cancelled_at IS NULL'
     and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'requester_status = ''active''::text'
     and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'addressee_status = ''active''::text'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'friendships' and pol.polname = 'friendships_insert_requester'),
  '[F2.4-a c1 c2 platform r12] the insert policy binds the requester to the caller and allows only a fresh, pending, uncancelled request between two active accounts');

select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'addressee_status = ''active''::text'
     and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'requester_status = ''active''::text'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'friendships' and pol.polname = 'friendships_select_party'),
  '[F2.4-a c10 c11 DR-5 A] the select policy shows a row only while the other party''s status copy is active');

-- ---- grants ---------------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'addressee_id',
  '[F2.4-a c1 c12 platform r12 r13] authenticated may INSERT exactly addressee_id: not the requester, the status, a copy or a clock');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'cancelled_at, status',
  '[F2.4-a c9 c12] authenticated may UPDATE exactly status and cancelled_at: not an id, a party, the creation or request time');

select is(
  (select string_agg(p, ', ' order by p) from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p,
          pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'friendships' and has_table_privilege('authenticated', c.oid, p)),
  'SELECT',
  '[F2.4-a c9 c12] authenticated holds table-level SELECT only on friendships (INSERT and UPDATE are per column; no DELETE, ever: retention is I9)');

select is(
  (select string_agg(p, ', ' order by p) from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p,
          pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_names' and has_table_privilege('authenticated', c.oid, p)),
  'SELECT',
  '[F2.4-a c11 c12] authenticated holds table-level SELECT only on regular_names');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_names' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'full_name, user_id',
  '[F2.4-a c12 DR-6 A] authenticated may INSERT user_id and full_name of regular_names (the registration trigger; fenced by the policy and the profile FK)');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_names' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  0::bigint,
  '[F2.4-a c12] authenticated may UPDATE no column of regular_names (a name changes only through regular_profiles, ON UPDATE CASCADE)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('friendships', 'regular_names')
      and (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
  0::bigint,
  '[F2.4-a c10 c12] anon holds no privilege on friendships or regular_names: a signed-out caller reads and writes nothing');

-- ---- regular_names: columns, keys --------------------------------------------------------------------------------------------------
select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_names' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'full_name:text:nn, user_id:uuid:nn',
  '[F2.4-a c11 DR-6 A] regular_names holds exactly user_id and full_name');

select is(
  (select string_agg(co.conname || ':' || pg_catalog.pg_get_constraintdef(co.oid), ' | ' order by co.conname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_names'),
  'regular_names_pkey:PRIMARY KEY (user_id) | '
  || 'regular_names_user_id_full_name_fkey:FOREIGN KEY (user_id, full_name) REFERENCES nestly.regular_profiles(user_id, full_name) ON UPDATE CASCADE ON DELETE CASCADE',
  '[F2.4-a c11 DR-6 A] a name row is the profile''s own (user_id, full_name) under a cascading composite FK: it cannot differ from regular_profiles');

select is(
  (select string_agg(c.relname || '.' || co.conname, ', ' order by co.conname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and co.contype = 'u' and co.conname in ('users_id_status_key', 'regular_profiles_user_id_full_name_key')),
  'regular_profiles.regular_profiles_user_id_full_name_key, users.users_id_status_key',
  '[F2.4-a c10 c11] the two composite UNIQUEs the copies and the names reference exist');

-- ---- functions and triggers: invoker, fixed search_path, nothing definer ------------------------------------------------------------
select is(
  (select string_agg(p.proname || ':' || p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), 'none'), ', ' order by p.proname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('friendships_transition', 'regular_names_insert')),
  'friendships_transition:false:search_path="", regular_names_insert:false:search_path=""',
  '[F2.4-a c12 platform r10] friendships_transition and regular_names_insert are SECURITY INVOKER with a fixed empty search_path');

select is((select count(*) from tests.approved_security_definer() as a where a ~ '^nestly\.(friendships|regular_names)'),
  0::bigint,
  '[F2.4-a c12 platform r10] F2.4a adds no definer to the approved list');

select is(
  (select string_agg(c.relname || '.' || t.tgname || ':' || t.tgenabled::text || ':' || (t.tgtype & 1)::text || ':' || (t.tgtype & 2)::text || ':' || (t.tgtype & 4)::text || ':' || (t.tgtype & 16)::text,
                     ', ' order by t.tgname)
     from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and not t.tgisinternal and t.tgname in ('friendships_transition', 'regular_profiles_name_insert')),
  -- tgtype bits: 1 row-level, 2 BEFORE, 4 INSERT, 16 UPDATE
  'friendships.friendships_transition:O:1:2:0:16, regular_profiles.regular_profiles_name_insert:O:1:0:4:0',
  '[F2.4-a c9 DR-6 A] friendships_transition is a row-level BEFORE UPDATE trigger, enabled; the name copy is a row-level AFTER INSERT trigger on regular_profiles');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('friendships_transition', 'regular_names_insert')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  0::bigint,
  '[F2.4-a c12] no runtime role holds EXECUTE on the two trigger functions (they run only as triggers)');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosecdef and (p.proname like 'friend%' or p.proname like 'regular_names%')),
  0::bigint,
  '[F2.4-a c12 platform r10] no SECURITY DEFINER function in schema nestly is named for friendships or regular_names');

select * from finish();

rollback;
