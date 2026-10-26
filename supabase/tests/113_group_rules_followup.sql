-- pgTAP, run by pg_prove as app_server (CI `db` job; the I10 completion C follow-up, 20261026400000_group_rules_followup.sql).
-- Source of expected values: FR-ALG-010 / BR-059 (the threshold is a number of members, 5%, 3 to 20, versioned), ⭐ OP-077 (each person
-- counts once), FR-GRP-003 / ⭐ OP-070 (a muted member only reads; a muted manager manages nothing until the mute ends, and still reads
-- the history), and the #180 follow-up "group_bans only through an enforcement record" — not the migration text.
-- People: a (Owner), b, c (Group Moderator), e = gr_e (Group Admin), f = gr_f (Regular), p = Professional (never a member).
-- The whole file is one transaction, so every enforcement record here shares one transaction clock: a direct block is tried only on a user
-- with no remove_block record in this file, and a direct unblock only where no unblock record exists.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F10.3-b c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();


create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') when 'd' then tests.fx_fr_id('fr_d')
    when 'e' then tests.fx_gr_id('gr_e') when 'f' then tests.fx_gr_id('gr_f')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.mk(p_who text, p_name text, p_privacy text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.groups (name, description, privacy) values (%L, 'about us', %L) returning id::text $q$, p_name, p_privacy))
$f$;
create function pg_temp.g(p_key text) returns uuid language sql as $f$ select current_setting('t.' || p_key)::uuid $f$;
create function pg_temp.join(p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g(p_group)))
$f$;
create function pg_temp.admit(p_owner text, p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_join_requests (group_id) values (%L) $q$, pg_temp.g(p_group)))
      || '/' || pg_temp.dml(p_owner, format($q$ update nestly.group_join_requests set status = 'approved' where group_id = %L and user_id = %L and status = 'pending' $q$,
                 pg_temp.g(p_group), pg_temp.id(p_who)))
$f$;
create function pg_temp.set_role(p_who text, p_group text, p_whom text, p_role text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_members set role = %L where group_id = %L and user_id = %L $q$, p_role, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.role_of(p_group text, p_whom text) returns text language sql as $f$
  select coalesce((select split_part(x, ':', 2) from unnest(string_to_array(tests.fx_gr_roles(pg_temp.g(p_group)), ',')) x
                    where split_part(x, ':', 1) = pg_temp.id(p_whom)::text), '-')
$f$;
create function pg_temp.invite(p_who text, p_group text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.inv(p_group text, p_whom text) returns text language sql as $f$
  select tests.fx_grr_invitation(pg_temp.g(p_group), pg_temp.id(p_whom))
$f$;
create function pg_temp.inv_set(p_who text, p_group text, p_whom text, p_status text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_invitations set status = %L where group_id = %L and invitee_id = %L $q$,
    p_status, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.enf(p_who text, p_group text, p_whom text, p_kind text, p_reason text default null, p_hours integer default null,
                            p_text text default null) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_member_enforcements (group_id, user_id, kind, reason_key, mute_hours, reason_text)
                                      values (%L, %L, %L, %L, %L, %L) $q$, pg_temp.g(p_group), pg_temp.id(p_whom), p_kind, p_reason, p_hours, p_text))
$f$;
create function pg_temp.gpost(p_who text, p_group text, p_body text default 'group post') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', %L, %L) $q$, p_body, pg_temp.g(p_group)))
$f$;
create function pg_temp.gpost_id(p_who text, p_group text, p_body text default 'group post') returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', %L, %L) returning id::text $q$, p_body, pg_temp.g(p_group)))
$f$;
create function pg_temp.comment(p_who text, p_post uuid, p_body text default 'a comment') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.comments (post_id, body) values (%L, %L) $q$, p_post, p_body))
$f$;
create function pg_temp.like_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reactions (post_id) values (%L) $q$, p_post))
$f$;
create function pg_temp.count(p_who text, p_sql text) returns text language sql as $f$
  select pg_temp.n(p_who, 'select count(*)::text from ' || p_sql)
$f$;
create function pg_temp.types(p_who text) returns text language sql as $f$ select tests.fx_nt_types(pg_temp.id(p_who)) $f$;

create function pg_temp.rank(p_who text, p_group text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select nestly.my_group_rank(%L)::text $q$, pg_temp.g(p_group)))
$f$;

select set_config('t.pub', pg_temp.mk('a', 'Night feeds', 'public'), true);
select pg_temp.join('b', 'pub');
select pg_temp.join('c', 'pub');
select pg_temp.join('e', 'pub');
select pg_temp.join('f', 'pub');
select pg_temp.set_role('a', 'pub', 'c', 'moderator');
select pg_temp.set_role('a', 'pub', 'e', 'admin');

-- ---- c1 structure ----------------------------------------------------------------------------------------------------------------
select is(pg_temp.n('a', $q$ select string_agg(version || ':' || is_active || ':' || coalesce(member_percent, 0) || '/' || coalesce(minimum_threshold, 0) || '/' || coalesce(maximum_threshold, 0), ',' order by version)
                               from nestly.group_highlight_configurations $q$),
  '1:false:0/0/0,2:false:5/3/20,3:true:5/3/20', '[F10.3-b c1 BR-059 OP-077] v3 (counted by people) is active with the numbers of v2; v1 and v2 stay as history');
select is((select string_agg(pl.polname || ':' || pl.polcmd::text || ':' || (select string_agg(r.rolname, '+') from pg_roles r where r.oid = any (pl.polroles)), ', ' order by pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid where c.relnamespace = 'nestly'::regnamespace and c.relname = 'reaction_owners'),
  'reaction_owners_insert_owner:a:authenticated, reaction_owners_select_notify:r:app_owner, reaction_owners_select_owner:r:authenticated',
  '[F10.3-b c1 rule 17] reaction_owners gains one read, for notify_group only (TO app_owner)');
select is((select string_agg(p.proname || ':' || p.prosecdef::text, ', ' order by p.proname) from pg_proc p
            where p.pronamespace = 'nestly'::regnamespace and p.proname in ('my_group_rank', 'notify_group')),
  'my_group_rank:false, notify_group:true', '[F10.3-b c1 r10] no new definer: my_group_rank stays invoker, notify_group the approved one');
select is((select pg_get_expr(pl.polqual, pl.polrelid) ~ $r$notify_scope\(\).*= 'group'$r$ and pg_get_expr(pl.polqual, pl.polrelid) ~ 'group_id IS NOT NULL'
             from pg_policy pl join pg_class c on c.oid = pl.polrelid
            where c.relnamespace = 'nestly'::regnamespace and c.relname = 'reaction_owners' and pl.polname = 'reaction_owners_select_notify'),
  true, '[F10.3-b c1 rule 17] reaction_owners_select_notify is opened only by notify_scope() = group, and only for likes on a group post');

-- ---- c2 a Highlight is counted by people, each once (⭐ OP-077, FR-ALG-010) ------------------------------------------------------------
-- five active members: the threshold is 3 people
select set_config('t.hp2', pg_temp.gpost_id('a', 'pub', 'teething tips?'), true);
select pg_temp.comment('b', pg_temp.g('hp2'), 'cold spoon');
select pg_temp.comment('c', pg_temp.g('hp2'), 'a ring');
select pg_temp.like_post('b', pg_temp.g('hp2'));
select is(tests.fx_grr_highlight(pg_temp.g('hp2')), '', '[F10.3-b c2 OP-077] two commenters, one of whom also likes (the like being inserted counts as its liker): two people, not a Highlight');
select set_config('t.hp', pg_temp.gpost_id('a', 'pub', 'how do you sleep?'), true);
select pg_temp.comment('b', pg_temp.g('hp'), 'one');
select pg_temp.comment('b', pg_temp.g('hp'), 'two');
select pg_temp.comment('b', pg_temp.g('hp'), 'three');
select pg_temp.like_post('b', pg_temp.g('hp'));
select pg_temp.like_post('a', pg_temp.g('hp'));
select pg_temp.comment('a', pg_temp.g('hp'), 'the author answers');
select is(tests.fx_grr_highlight(pg_temp.g('hp')), '', '[F10.3-b c2 OP-077 FR-ALG-010] three comments and a like by one member, and the author''s own: one person, not a Highlight');
select pg_temp.comment('c', pg_temp.g('hp'), 'me too');
select is(tests.fx_grr_highlight(pg_temp.g('hp')), '', '[F10.3-b c2 OP-077] two people: not yet');
select pg_temp.like_post('e', pg_temp.g('hp'));
select is(tests.fx_grr_highlight(pg_temp.g('hp')), 'threshold=3 members=5 version=3', '[F10.3-b c2 OP-077 AC-066 AC-165] the third person (a like) makes it a Highlight, under v3');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.reaction_owners o join nestly.reactions x on x.id = o.reaction_id where x.post_id = %L $q$, pg_temp.g('hp'))), '1',
  '[F10.3-b c2 privacy] a member still reads only its own like owner, not who else liked');
select set_config('nestly.notify_scope', 'group', true);
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.reaction_owners o join nestly.reactions x on x.id = o.reaction_id where x.post_id = %L $q$, pg_temp.g('hp'))), '1',
  '[F10.3-b c2 privacy rule 17] a member who sets nestly.notify_scope = group itself still reads only its own like owner (the read is TO app_owner)');
select set_config('nestly.notify_scope', '', true);

-- ---- c3 a muted Group manager manages nothing (⭐ OP-070, FR-GRP-003) ---------------------------------------------------------------
select set_config('t.fpost', pg_temp.gpost_id('f', 'pub', 'by f'), true);
select is(pg_temp.enf('e', 'pub', 'b', 'warn_mute', 'spam', 24), 'OK:1', '[F10.3-b c3 fixture] the Admin mutes b (history before the Moderator is muted)');
select is(pg_temp.enf('c', 'pub', 'd', 'remove_block', 'spam'), 'OK:1', '[F10.3-b c3 fixture] the Moderator blocks a non-member before its mute');
select is(pg_temp.count('c', format('nestly.group_bans where group_id = %L', pg_temp.g('pub'))), '1', '[F10.3-b c3] the Moderator reads the blocked list before the mute');
select is(pg_temp.rank('c', 'pub'), '2', '[F10.3-b c3] the Moderator ranks 2 before the mute');
select is(pg_temp.enf('a', 'pub', 'c', 'warn_mute', 'rules', 24), 'OK:1', '[F10.3-b c3 FR-GRP-003] the Owner mutes the Group Moderator');
select is(pg_temp.rank('c', 'pub'), '1', '[F10.3-b c3 OP-070] while muted, the Moderator ranks as a member');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'spam', 24), 'ERR:42501', '[F10.3-b c3 OP-070] a muted Moderator mutes no one');
select is(pg_temp.enf('c', 'pub', 'f', 'remove_block', 'spam'), 'ERR:42501', '[F10.3-b c3 OP-070] nor removes and blocks');
select is(pg_temp.n('c', format($q$ select nestly.delete_post(%L)::text $q$, pg_temp.g('fpost'))), '0', '[F10.3-b c3 OP-070] nor removes a member''s post');
select is(pg_temp.count('c', format('nestly.group_bans where group_id = %L', pg_temp.g('pub'))), '0', '[F10.3-b c3 OP-070] nor reads the blocked list while muted');
select is(pg_temp.count('c', format('nestly.posts where group_id = %L', pg_temp.g('pub'))), '3', '[F10.3-b c3 FR-GRP-003] the muted Moderator still reads the Group');
select is(pg_temp.count('c', format('nestly.group_member_enforcements where group_id = %L', pg_temp.g('pub'))), '3',
  '[F10.3-b c3 OP-070] and still reads the Group''s enforcement history (b''s mute, d''s block and its own mute)');
select is(pg_temp.n('c', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('b'))), '1',
  '[F10.3-b c3 OP-070] with the names in it');

select is(pg_temp.enf('a', 'pub', 'e', 'warn_mute', 'rules', 168), 'OK:1', '[F10.3-b c3] the Owner mutes the Group Admin');
select is(pg_temp.rank('e', 'pub'), '1', '[F10.3-b c3 OP-070] a muted Admin ranks as a member too');
select is(pg_temp.dml('e', format($q$ update nestly.groups set description = 'changed' where id = %L $q$, pg_temp.g('pub'))), 'OK:0',
  '[F10.3-b c3 OP-070] a muted Admin does not edit the Group');
select is(pg_temp.set_role('e', 'pub', 'f', 'moderator'), 'OK:0', '[F10.3-b c3 OP-070] nor names a Group Moderator');
select is(pg_temp.rank('a', 'pub'), '4', '[F10.3-b c3] the Owner is never muted (no higher Role) and keeps every action');

select tests.fx_grr_end_mute(pg_temp.g('pub'), pg_temp.id('c'));
select tests.fx_grr_end_mute(pg_temp.g('pub'), pg_temp.id('e'));
select is(pg_temp.rank('c', 'pub'), '2', '[F10.3-b c3 FR-GRP-003] the mute ends by itself: the Moderator ranks 2 again');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'spam', 24), 'OK:1', '[F10.3-b c3] and mutes a member again');
select is(pg_temp.dml('e', format($q$ update nestly.groups set description = 'changed' where id = %L $q$, pg_temp.g('pub'))), 'OK:1',
  '[F10.3-b c3] the Admin edits the Group again');

-- a mute recorded before an ownership transfer does not hold the new Owner back (the Owner is never muted)
select is(pg_temp.enf('a', 'pub', 'e', 'warn_mute', 'rules', 24), 'OK:1', '[F10.3-b c3 fixture] the Owner mutes the Admin again');
select is(pg_temp.rank('e', 'pub'), '1', '[F10.3-b c3 OP-070] (muted: ranks as a member)');
select is(pg_temp.set_role('a', 'pub', 'e', 'owner'), 'OK:1', '[F10.3-b c3 FR-GRP-003] the Owner makes the muted Admin an Owner (a transfer, step 1)');
select is(pg_temp.rank('e', 'pub'), '4', '[F10.3-b c3 OP-070] the new Owner has every Owner right at once, the earlier mute notwithstanding');
select is(pg_temp.dml('e', format($q$ update nestly.groups set description = 'by the new owner' where id = %L $q$, pg_temp.g('pub'))), 'OK:1',
  '[F10.3-b c3] and edits the Group');

-- ---- c4 group_bans only through an enforcement record -------------------------------------------------------------------------------
select is(pg_temp.dml('a', format($q$ insert into nestly.group_bans (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('p'))), 'ERR:42501',
  '[F10.3-b c4 FR-GRP-003] the Owner cannot block directly: a block needs its remove_block record');
select is(tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('p')), false, '[F10.3-b c4] nothing was written');
select is(pg_temp.enf('a', 'pub', 'p', 'remove_block', 'spam'), 'OK:1', '[F10.3-b c4 AC-144] through remove_block the block is written');
select is(tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('p')), true, '[F10.3-b c4] and stands');
select is(pg_temp.dml('a', format($q$ delete from nestly.group_bans where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('p'))), 'OK:0',
  '[F10.3-b c4 FR-GRP-003] the Owner cannot unblock directly: an unblock needs its record');
select is(tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('p')), true, '[F10.3-b c4] the block still stands');
select is(pg_temp.enf('a', 'pub', 'p', 'unblock'), 'OK:1', '[F10.3-b c4] through unblock it is lifted');
select is(tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('p')), false, '[F10.3-b c4] and gone');
select is(pg_temp.count('a', format('nestly.group_member_enforcements where group_id = %L and user_id = %L', pg_temp.g('pub'), pg_temp.id('p'))), '2',
  '[F10.3-b c4 OP-070] both actions are in the history');

select * from finish();
rollback;
