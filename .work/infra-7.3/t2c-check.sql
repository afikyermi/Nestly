-- T2 block C (read only): what blocks A and B produced, plus who we are connected as.
select current_user, session_user, version();

select r.rolname as member, g.rolname as granted,
       m.inherit_option, m.set_option, m.admin_option
from pg_auth_members m
join pg_roles r on r.oid = m.member
join pg_roles g on g.oid = m.roleid
where r.rolname like 'probe_%';

select rolname, rolsuper, rolbypassrls, rolinherit, rolcanlogin
from pg_roles where rolname like 'probe_%';

-- Does postgres hold ADMIN OPTION on authenticated (needed on PG 16+ to grant it)?
select g.rolname as granted, r.rolname as member, m.admin_option
from pg_auth_members m
join pg_roles r on r.oid = m.member
join pg_roles g on g.oid = m.roleid
where g.rolname = 'authenticated' and r.rolname = current_user;
