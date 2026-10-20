-- =====================================================================================================================
-- Bootstrap step 3 — the single Super Admin (BR-021). Run by Afik, as postgres, once per environment, AFTER the migrations.
-- Never run by the app, CI or an agent; it creates no Auth account and sets no password.
--
--   Supabase SQL Editor (runs as postgres): paste this file, replace CHANGE-ME@example.com below with the Admin's email, run.
--
-- Before: create the Auth account for the Admin in the Supabase dashboard (Authentication > Users > Add user, email + password,
--   "Auto confirm"). It must be an Auth user with NO Nestly account yet: an account's type never changes (BR-016), so an existing
--   Regular or Professional account cannot be promoted. Use a dedicated address for the Admin (a Gmail "+admin" alias works).
-- Effect: inserts the nestly.users row (account_type admin, status active); the trigger on users writes its staff_roles row.
-- Idempotent: running it again changes nothing. It refuses (and changes nothing) when the email has no Auth user, when that
--   Auth user already has a Nestly account of another type, or when a different Admin already exists (BR-021: one Admin).
-- The Admin then signs in on the normal login screen and sets the recovery questions once (the same gate as every account).
-- =====================================================================================================================

begin;

do $$
declare
  v_email text := lower(btrim('CHANGE-ME@example.com'));
  v_id    uuid;
  v_type  text;
  v_other uuid;
begin
  if v_email = 'change-me@example.com' then
    raise exception 'replace CHANGE-ME@example.com with the Admin''s email first';
  end if;
  if current_user <> 'postgres' then
    raise exception '03-super-admin.sql must run as postgres (current_user is %)', current_user;
  end if;
  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then
    raise exception 'no Auth user with this email: create it in the Supabase dashboard first';
  end if;
  select n.account_type into v_type from nestly.users n where n.id = v_id;
  if v_type = 'admin' then
    raise notice 'already the Admin: nothing to do';
    return;
  end if;
  if v_type is not null then
    raise exception 'this Auth user already has a % account; use a dedicated Auth user for the Admin', v_type;
  end if;
  select n.id into v_other from nestly.users n where n.account_type = 'admin' limit 1;
  if v_other is not null then
    raise exception 'an Admin already exists (BR-021: one Admin)';
  end if;
  insert into nestly.users (id, account_type, status) values (v_id, 'admin', 'active');
  raise notice 'the Admin account was created';
end
$$;

commit;
