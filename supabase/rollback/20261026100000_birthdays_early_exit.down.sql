-- =====================================================================================================================
-- Down script for supabase/migrations/20261026100000_birthdays_early_exit.sql: restores the body of nestly.deliver_child_birthdays()
-- verbatim as 20261023100000_srs_audit_fixes.sql created it (no early return without a Friend). Outside supabase/migrations on purpose:
-- the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a change to a SECURITY DEFINER function: Afik only.
-- Safe:     always: the migration wrote no data and the result of the function is the same either way.
-- Restores: the previous body; owner, SECURITY DEFINER, search_path, grants and comment were never changed; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the birthdays early exit down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

create or replace function nestly.deliver_child_birthdays()
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
  v_nonce uuid := pg_catalog.gen_random_uuid();
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
  insert into nestly.trend_scopes (nonce) values (v_nonce);
  perform pg_catalog.set_config('nestly.birthday_scope', v_nonce::text, true);
  perform pg_catalog.set_config('nestly.notify_scope', 'birthday', true);
  insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id)
  select v_me, 'child_birthday', b.parent_id, 'user', b.parent_id,
         pg_catalog.md5('child_birthday:' || b.child_id::text || ':' || pg_catalog.date_part('year', b.day)::text)::uuid
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
  perform pg_catalog.set_config('nestly.birthday_scope', '', true);
  delete from nestly.trend_scopes where nonce = v_nonce;
  return n;
end
$$;

delete from supabase_migrations.schema_migrations where version = '20261026100000';

commit;
