-- pgTAP, run by pg_prove as app_server (CI `db` job): the two accepted-only partial indexes on nestly.friendships (migration
-- 20261026500000, performance plan item M). Structure only; no rows. Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F2.4-b c0 m] session_user is app_server (this file must not run under another login)');

select is(
  (select pg_catalog.pg_get_indexdef(ic.oid) from pg_catalog.pg_class ic
    where ic.relname = 'friendships_requester_id_addressee_id_accepted_idx' and ic.relnamespace = 'nestly'::regnamespace),
  'CREATE INDEX friendships_requester_id_addressee_id_accepted_idx ON nestly.friendships USING btree (requester_id, addressee_id) WHERE (status = ''accepted''::text)',
  '[F2.4-b c3 m] the requester-side index is on (requester_id, addressee_id) and partial on status = accepted');
select is(
  (select pg_catalog.pg_get_indexdef(ic.oid) from pg_catalog.pg_class ic
    where ic.relname = 'friendships_addressee_id_requester_id_accepted_idx' and ic.relnamespace = 'nestly'::regnamespace),
  'CREATE INDEX friendships_addressee_id_requester_id_accepted_idx ON nestly.friendships USING btree (addressee_id, requester_id) WHERE (status = ''accepted''::text)',
  '[F2.4-b c3 m] the addressee-side index is on (addressee_id, requester_id) and partial on status = accepted');
select is(
  (select count(*) from pg_catalog.pg_index x join pg_catalog.pg_class ic on ic.oid = x.indexrelid
    where ic.relnamespace = 'nestly'::regnamespace
      and ic.relname in ('friendships_requester_id_addressee_id_accepted_idx', 'friendships_addressee_id_requester_id_accepted_idx')
      and x.indisvalid and not x.indisunique and x.indpred is not null),
  2::bigint, '[F2.4-b c3 m] both are valid, non-unique and carry a predicate');
select is(
  (select count(*) from pg_catalog.pg_description d join pg_catalog.pg_class ic on ic.oid = d.objoid
    where ic.relnamespace = 'nestly'::regnamespace and ic.relname like 'friendships\_%\_accepted\_idx' and d.description <> ''),
  2::bigint, '[F2.4-b c3 m] both indexes carry a comment');

select * from finish();
rollback;
