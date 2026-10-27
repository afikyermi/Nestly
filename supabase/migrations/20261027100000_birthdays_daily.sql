-- =====================================================================================================================
-- deliver_child_birthdays(): once per Israel day per user, at the first entry of the day — migration only.
--
-- Why. Preview pg_stat_statements (27.10.2026): `select nestly.deliver_child_birthdays()` is still the top statement by total time
-- (1,706 calls, mean 426 ms). The server calls it on every non-poll notifications read of a Regular user (app load, bell, notifications
-- screen), and a birthday changes at most once a day. Decided by Afik 27.10.2026: the check runs at the user's first entry of the day
-- (Israel's date, Asia/Jerusalem); another entry that day, a new sign-in, the bell or the notifications screen do not run it again.
-- Exception: a Friendship accepted later that day makes the next call run, so that Friend's child's birthday appears the same day (AC-192).
--
-- Changes: 1. nestly.birthday_checks (new table): one row per user, the instant of the last check. RLS forced; no grant to any runtime
--             role (public, anon, authenticated: revoke all); read, inserted and updated only by deliver_child_birthdays() through three
--             TO app_owner policies, for auth.uid()'s own row and only while the function declares nestly.notify_scope = 'birthday'.
--             Cascades with the account (nestly.users), so the account-deletion purge removes it with the users row.
--          2. The body of nestly.deliver_child_birthdays() (create or replace: owner, SECURITY DEFINER, search_path = '' and grants stay as
--             20261023100000_srs_audit_fixes.sql set them). After the caller check, a gate: when the caller's checked_at falls on today's
--             Israel date and no Friendship of the caller was accepted (status accepted, responded_at) after it, return 0. Otherwise it
--             records checked_at = now() and runs exactly as 20261026100000_birthdays_early_exit.sql (category, no-Friend exit,
--             delivery; on conflict do nothing, so two first calls at once deliver once). The comment gains the daily rule.
--
-- No data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261027100000_birthdays_daily.down.sql (drops the table, restores the previous body and comment).
-- =====================================================================================================================

-- 1. birthday_checks ------------------------------------------------------------------------------------------------
create table nestly.birthday_checks (
  user_id    uuid        not null
    constraint birthday_checks_pkey primary key
    constraint birthday_checks_user_id_fkey references nestly.users (id) on delete cascade,
  checked_at timestamptz not null
);

alter table nestly.birthday_checks enable row level security, force row level security;

revoke all on table nestly.birthday_checks from public, anon, authenticated;

create policy birthday_checks_select_birthday on nestly.birthday_checks
  for select to app_owner
  using (user_id = (select auth.uid()) and (select nestly.notify_scope()) = 'birthday');

create policy birthday_checks_insert_birthday on nestly.birthday_checks
  for insert to app_owner
  with check (user_id = (select auth.uid()) and (select nestly.notify_scope()) = 'birthday');

create policy birthday_checks_update_birthday on nestly.birthday_checks
  for update to app_owner
  using (user_id = (select auth.uid()) and (select nestly.notify_scope()) = 'birthday')
  with check (user_id = (select auth.uid()) and (select nestly.notify_scope()) = 'birthday');

-- 2. deliver_child_birthdays() ----------------------------------------------------------------------------------------
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
  v_checked timestamptz;
  v_year integer;
  v_nonce uuid := pg_catalog.gen_random_uuid();
  n integer;
begin
  if v_me is null or not nestly.is_active_account() or nestly.caller_account_type() is distinct from 'regular' then
    return 0;
  end if;
  -- once per Israel day, unless a Friendship of the caller was accepted since the last check (AC-192)
  perform pg_catalog.set_config('nestly.notify_scope', 'birthday', true);
  select b.checked_at into v_checked from nestly.birthday_checks b where b.user_id = v_me;
  if v_checked is not null and (v_checked at time zone 'Asia/Jerusalem')::date = v_today
     and not exists (select 1 from nestly.friendships f
                      where f.status = 'accepted' and f.responded_at > v_checked
                        and (f.requester_id = v_me or f.addressee_id = v_me)) then
    perform pg_catalog.set_config('nestly.notify_scope', '', true);
    return 0;
  end if;
  insert into nestly.birthday_checks as b (user_id, checked_at) values (v_me, pg_catalog.now())
  on conflict (user_id) do update set checked_at = excluded.checked_at;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
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

-- 3. Comments ---------------------------------------------------------------------------------------------------------
comment on table nestly.birthday_checks is 'AC-192 (Afik 27.10.2026): per Regular account, the instant deliver_child_birthdays() last checked for birthdays; the next check runs on a later Israel date, or after a Friendship of the account is accepted. Read and written only by that function for auth.uid()''s own row (TO app_owner policies; no runtime role holds a grant); working state, cascades with the account.';
comment on column nestly.birthday_checks.user_id is 'The account that was checked.';
comment on column nestly.birthday_checks.checked_at is 'The instant of the last check, database clock (its Israel date decides whether today''s check ran).';
comment on policy birthday_checks_select_birthday on nestly.birthday_checks is 'deliver_child_birthdays() reads the caller''s own row while it declares the birthday scope.';
comment on policy birthday_checks_insert_birthday on nestly.birthday_checks is 'deliver_child_birthdays() creates the caller''s own row while it declares the birthday scope.';
comment on policy birthday_checks_update_birthday on nestly.birthday_checks is 'deliver_child_birthdays() updates the caller''s own row while it declares the birthday scope.';
comment on function nestly.deliver_child_birthdays() is
  'FR-NOTIF-003, BR-037, AC-046: writes into the caller''s own notifications one child_birthday per child of an accepted, active Friend whose birthday (Israel''s date) fell in the last seven days, today included, timed at the delivery (never at the birthday); only when the parent allows it (is_child_birthday_shared), the caller''s birthdays category is on and no user block stands between them. Actor and target: the parent; no child''s name, sex, age, birth date or id (a child''s name only to a Friend who sees it on the parent''s profile, and the profile shows it to no one: FR-PRIV-001). Regular callers only; returns the number written. SECURITY DEFINER (rule 17, the I7 shape; approved by Afik 21.10.2026); its reads of Friends open only under its own nonce in trend_scopes (nestly.birthday_scope). Runs at most once per Israel day per caller: the first call of the day records it in birthday_checks and delivers; a later call that day returns 0 without delivering, unless a Friendship of the caller was accepted after the recorded check (AC-192).';
