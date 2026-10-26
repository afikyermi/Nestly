-- =====================================================================================================================
-- deliver_child_birthdays(): return 0 before writing its scope row when the caller has no Friend — migration only (plan ח3).
--
-- Why. Preview pg_stat_statements (26.10.2026): `select nestly.deliver_child_birthdays()` was the top statement by total time (1,472
-- calls, mean 462 ms). Every notifications open by a Regular user wrote and deleted a trend_scopes row, even with no Friend to deliver from.
-- Approved by Afik 26.10.2026 (decisions-in-force.md §21.6; §19.1: a definer that returns only a number).
--
-- Changes: the body of nestly.deliver_child_birthdays() only (create or replace: owner, SECURITY DEFINER, search_path = '', grants and
--          comment stay as 20261023100000_srs_audit_fixes.sql set them). After the birthdays-category check and before the trend_scopes
--          insert, it returns 0 when no friendships row has status accepted, both sides active and the caller as requester or addressee:
--          exactly the conditions of the delivery's own join, read through the same policy (friendships_select_party, which app_owner
--          inherits through `authenticated`; no friendships policy depends on nestly.birthday_scope or nestly.notify_scope = 'birthday',
--          so the early read sees the same rows the join does). Without such a row the join yields nothing, so the result is unchanged
--          (FR-NOTIF-003, BR-037, AC-046); with one, the body runs exactly as before.
--
-- No table, no policy, no data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261026100000_birthdays_early_exit.down.sql (restores the previous body verbatim).
-- =====================================================================================================================

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
  if not exists (select 1 from nestly.friendships f
                  where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                    and v_me in (f.requester_id, f.addressee_id)) then
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
