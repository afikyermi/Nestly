-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.3a criterion c1: comment/reply body cap of 1,000 characters, and column
-- comments that agree with the grants).
-- Source of expected values: .work/comments-likes/spec.md c1 and .work/comments-likes/schema.md (the VAL and the verbatim comment texts),
-- not the migration text. Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.3-a c1] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.dml(p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), p_sql)
$f$;

select set_config('t.p', tests.fx_po_add(tests.fx_id('a'))::text, true);
select set_config('t.parent', tests.fx_cm_add(tests.fx_id('b'), current_setting('t.p')::uuid, 'parent comment')::text, true);

create function pg_temp.cm(p_body text) returns text language sql as $f$
  select pg_temp.dml(format($q$ insert into nestly.comments (post_id, body) values (%L, %L) $q$, current_setting('t.p'), p_body))
$f$;
create function pg_temp.rp(p_body text) returns text language sql as $f$
  select pg_temp.dml(format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, %L) $q$, current_setting('t.p'), current_setting('t.parent'), p_body))
$f$;

-- ---- c1: a comment ---------------------------------------------------------------------------------------------------------------
select is(pg_temp.cm(repeat('x', 1000)), 'OK:1', '[F3.3-a c1] a 1,000-character comment is accepted');
select is(pg_temp.cm(repeat(U&'\05D0', 1000)), 'OK:1', '[F3.3-a c1] 1,000 Hebrew characters (2,000 bytes) are accepted: the cap counts characters');
select set_config('t.n0', tests.fx_cm_count()::text, true);
select is(pg_temp.cm(repeat('x', 1001)), 'ERR:23514', '[F3.3-a c1] a 1,001-character comment is refused with 23514');
select is(pg_temp.cm(repeat(U&'\05D0', 1001)), 'ERR:23514', '[F3.3-a c1] 1,001 Hebrew characters are refused too');
select is(pg_temp.cm(repeat('x', 100000)), 'ERR:23514', '[F3.3-a c1] a very long comment is refused');
select is(tests.fx_cm_count()::text, current_setting('t.n0'), '[F3.3-a c1] the refused comments wrote no row');

-- ---- c1: a reply -----------------------------------------------------------------------------------------------------------------
select is(pg_temp.rp(repeat('x', 1000)), 'OK:1', '[F3.3-a c1] a 1,000-character reply is accepted');
select is(pg_temp.rp(repeat(U&'\05D0', 1000)), 'OK:1', '[F3.3-a c1] a reply of 1,000 Hebrew characters is accepted');
select set_config('t.n1', tests.fx_cm_count()::text, true);
select is(pg_temp.rp(repeat('x', 1001)), 'ERR:23514', '[F3.3-a c1] a 1,001-character reply is refused with 23514');
select is(pg_temp.rp(repeat(U&'\05D0', 1001)), 'ERR:23514', '[F3.3-a c1] a reply of 1,001 Hebrew characters is refused');
select is(tests.fx_cm_count()::text, current_setting('t.n1'), '[F3.3-a c1] the refused replies wrote no row');

-- ---- c1: blank text still refused; the posts cap unchanged --------------------------------------------------------------------------
select is(pg_temp.cm('   '), 'ERR:23514', '[F3.3-a c1] a blank comment is still refused with 23514');
select is(pg_temp.rp(''), 'ERR:23514', '[F3.3-a c1] an empty reply is still refused with 23514');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 2000))), 'OK:1', '[F3.3-a c1] a 2,000-character post is still accepted (posts cap unchanged)');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 2001))), 'ERR:23514', '[F3.3-a c1] a 2,001-character post is still refused');

-- ---- c1: update ------------------------------------------------------------------------------------------------------------------
select set_config('t.c', tests.fx_cm_add(tests.fx_id('a'), current_setting('t.p')::uuid, 'to be edited')::text, true);
select is(pg_temp.dml(format($q$ update nestly.comments set body = %L where id = %L $q$, 'new text', current_setting('t.c'))), 'ERR:42501',
  '[F3.3-a c1] authenticated has no UPDATE path on comments.body (42501)');
select is(tests.fx_cm_set_body(current_setting('t.c')::uuid, repeat('y', 1000)), 'OK:1', '[F3.3-a c1] a privileged update to 1,000 characters is accepted');
select is(tests.fx_cm_set_body(current_setting('t.c')::uuid, repeat('z', 1001)), 'ERR:23514', '[F3.3-a c1] a privileged update to 1,001 characters is refused with 23514');
select is(tests.fx_cm_body(current_setting('t.c')::uuid), repeat('y', 1000), '[F3.3-a c1] and the stored body is the 1,000-character one');
select is(tests.fx_cm_set_body(current_setting('t.c')::uuid, '   '), 'ERR:23514', '[F3.3-a c1] a privileged update to blank is refused too');

-- ---- finding 8: the nine rewritten column and constraint comments -------------------------------------------------------------------
create function pg_temp.cd(p_table text, p_col text) returns text language sql as $f$
  select pg_catalog.col_description(c.oid, a.attnum)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = p_col and not a.attisdropped
   where n.nspname = 'nestly' and c.relname = p_table
$f$;

select is(pg_temp.cd('posts', 'author_id'),
  'The named author (database default auth.uid(), a Regular or Professional account; posts_author_status_fkey proves it in users); NULL on an anonymous post (set by posts_insert_prepare). Readable under posts_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.',
  '[F3.3-a finding 8] posts.author_id description matches its grants');
select is(pg_temp.cd('post_authors', 'author_id'),
  'The real author (default auth.uid(); a Regular profile). Readable only by that author (post_authors_select_author, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.',
  '[F3.3-a finding 8] post_authors.author_id description matches its grants');
select is(pg_temp.cd('comments', 'author_id'),
  'The commenter (default auth.uid(), a Regular or Professional account; comments_author_status_fkey proves it in users); NULL only for the real author of an anonymous post (comments_insert_prepare). Readable under comments_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.',
  '[F3.3-a finding 8] comments.author_id description matches its grants');
select is(pg_temp.cd('comments', 'is_by_post_author'),
  'AC-076 "המחבר": set by comments_insert_prepare. Readable under comments_select_viewer (column SELECT grant; the server renders byAuthor from it); no INSERT or UPDATE grant.',
  '[F3.3-a finding 8] comments.is_by_post_author description matches its grants');
select is(pg_temp.cd('reactions', 'is_by_author'),
  'The liker is the content''s author (reactions_insert_prepare); the quality count excludes it. Readable under reactions_select_reader (column SELECT grant; ranking SQL reads it); no INSERT or UPDATE grant. Carries no identity. API responses never emit it.',
  '[F3.3-a finding 8] reactions.is_by_author description matches its grants');
select is(pg_temp.cd('reaction_owners', 'user_id'),
  'The liker (default auth.uid(), a Regular or Professional account; reaction_owners_liker_status_fkey proves it in users). Readable only by that liker (reaction_owners_select_owner, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.',
  '[F3.3-a finding 8] reaction_owners.user_id description matches its grants');
select is(pg_temp.cd('reports', 'reporter_id'),
  'The reporter (default auth.uid()). No FK since I9: the report outlives a deleted reporter for 90 days (BR-073). Readable only by that reporter (reports_select_reporter, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.',
  '[F3.3-a finding 8 · I9] reports.reporter_id description matches its grants');
select is(pg_temp.cd('comments', 'body'),
  'The text of a comment or a reply: 1-1,000 characters (comments_body_check, comments_body_length_check; shared COMMENT_BODY_MAX).',
  '[F3.3-a c1] comments.body description states the 1,000 cap');
select is(pg_temp.cd('posts', 'body'),
  'The text, or the sharer''s text on a share; NULL only on a share. At most 2,000 characters (posts_body_length_check).',
  '[F3.3-a c1] posts.body description states the 2,000 cap');

select is(
  (select pg_catalog.obj_description(con.oid, 'pg_constraint')
     from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'comments' and con.conname = 'comments_body_length_check'),
  'VAL (F3.3 c1): a comment or reply is at most 1,000 characters; shared COMMENT_BODY_MAX.',
  '[F3.3-a c1] the new constraint is described');

-- the general rule: a column whose description says "never granted" is granted to no client role (and the check is not vacuous)
select cmp_ok(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and a.attnum > 0 and not a.attisdropped and pg_catalog.col_description(c.oid, a.attnum) ~* 'never granted'),
  '>=', 5::bigint, '[F3.3-a finding 8] at least five nestly columns are described "never granted" (the rule below is not vacuous)');

select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname || ' -> ' || r.rolname, ', ' order by c.relname, a.attname, r.rolname), '(none)')
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          (values ('authenticated'), ('anon')) r(rolname)
    where n.nspname = 'nestly' and a.attnum > 0 and not a.attisdropped and pg_catalog.col_description(c.oid, a.attnum) ~* 'never granted'
      and (has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
  '(none)', '[F3.3-a finding 8] no column described "never granted" holds any privilege for authenticated or anon');

select * from finish();

rollback;
