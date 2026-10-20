-- =====================================================================================================================
-- Images, profile photos, Stories, the image approval queue and the training set -- I5 (media and Stories), migration only.
--
-- SRS: FR-FEED-002 (images in posts) · FR-PROFILE-001 (profile photo) · FR-FEED-008 (Stories) · NFR-MEDIA-001 · BR-076 (as replaced by Afik's
--      image policy of 20.10.2026, decisions-in-force.md §2) · BR-077 · VAL-041 · VAL-042 · ERR-040 · AC-021, AC-102..105;
--      storage and jobs: Afik 20.10.2026 (decisions-in-force.md §7); platform rules 1, 6, 8, 10, 12, 13, 15, 16, 18 (data-model.md).
--
-- The image bytes are never in the database: they are in private storage, reached only by the server's one storage module. These tables
-- hold what the policies need to decide who may see an image, and the state of the background check.
--
-- media_assets            one row per uploaded image (kind post, profile or story). status: pending (only the uploader sees it, "ממתין לבדיקה")
--                         -> passed (the check found nothing) | queued (blocked, unsure, or the check kept failing: waits for staff with
--                         CONTENT_MODERATE, the Admin always) -> approved | rejected | suspected (a child may be in danger: hidden from everyone,
--                         kept 90 days per M6, then deleted). A rejected image's file is removed at once by the job (after its training copy);
--                         its row stays 30 days with no file so the uploader sees the rejection (Afik 20.10.2026). Others read an image only when passed or approved, and only through what it belongs to
--                         (a post, profile photo or Story they can read). owner_id is never granted to a client: an anonymous post's image
--                         must not name its author. Staff mark "a child is in the image" (is_child) while deciding.
-- profile_photos          the current photo of a Regular or Professional account. Replacing it deletes the previous image row at once (BR-077);
--                         the server then removes the file.
-- stories                 FR-FEED-008: one image, optional text, audience everyone or friends, visible 24 hours; at most 10 in 24 hours
--                         (VAL-042, ERR-040, checked by the database under a per-author lock). Regular accounts only; never anonymous.
-- media_training_samples  the training set's index (Afik 20.10.2026): every image the model blocked or was unsure about, children included, with the
--                         staff decision, and every image that passed but whose post was removed after a report (a model miss). Copied by the
--                         background job into a separate private bucket (encrypted at rest by the platform). Never a suspected image (the insert
--                         policy). No client reads it: no manual viewing. Expires (6 months by default, set by the job).
-- media_training_events   the access record of the training set: one row per sample added or expired, written by trigger in the same
--                         transaction. Read by the Admin and AUDIT_LOG_VIEW; nobody changes it.
--
-- The job role app_jobs (rule 6, Afik 20.10.2026) records the check result on a pending image, copies training samples and purges what BR-077
-- deletes; each reach is a TO app_jobs policy below. A staff decision is audited by audit_trigger() (rule 18), replaced here with one branch;
-- the rest of the function is the text of 20261021100000_status_guides_admin.sql, unchanged.
-- No new SECURITY DEFINER function: every new function is SECURITY INVOKER with search_path ''.
-- Phase: expand (new tables; the code on main does not read them). Down script: supabase/rollback/20261021500000_media_stories.down.sql
-- (refuses while any of the four tables holds a row).
-- =====================================================================================================================

-- 1. media_assets ---------------------------------------------------------------------------------------------------------------
create table nestly.media_assets (
  id             uuid        not null default gen_random_uuid(),
  owner_id       uuid        not null default auth.uid(),
  owner_status   text        not null default 'active',
  kind           text        not null,
  status         text        not null default 'pending',
  mime           text        not null,
  width          integer     not null,
  height         integer     not null,
  byte_size      integer     not null,
  post_id        uuid,
  position       smallint,
  is_child       boolean     not null default false,
  queue_reason   text,
  scores         jsonb,
  check_attempts smallint    not null default 0,
  checked_at     timestamptz,
  decided_by     uuid,
  decided_at     timestamptz,
  purge_after    timestamptz,
  is_file_removed boolean    not null default false,
  created_at     timestamptz not null default now(),
  constraint media_assets_pkey primary key (id),
  constraint media_assets_id_status_key unique (id, status),
  constraint media_assets_post_id_position_key unique (post_id, position),
  constraint media_assets_kind_check check (kind in ('post', 'profile', 'story')),
  constraint media_assets_status_check check (status in ('pending', 'passed', 'queued', 'approved', 'rejected', 'suspected')),
  constraint media_assets_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_assets_width_check check (width between 1 and 2048),
  constraint media_assets_height_check check (height between 1 and 2048),
  constraint media_assets_byte_size_check check (byte_size between 1 and 15728640),
  constraint media_assets_position_check check (position is null or position between 0 and 3),
  constraint media_assets_post_kind_check check (post_id is null or kind = 'post'),
  constraint media_assets_post_position_check check ((post_id is null) = (position is null)),
  constraint media_assets_queue_reason_check check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error')),
  constraint media_assets_queued_reason_check check (status <> 'queued' or queue_reason is not null),
  constraint media_assets_child_check check (not is_child or queue_reason is not null),
  constraint media_assets_decided_check check ((status in ('approved', 'rejected', 'suspected')) = (decided_at is not null)),
  constraint media_assets_suspected_check check ((status = 'suspected') = (purge_after is not null) and (status <> 'suspected' or is_child)),
  constraint media_assets_attempts_check check (check_attempts between 0 and 20),
  constraint media_assets_file_removed_check check (not is_file_removed or status = 'rejected'),
  constraint media_assets_owner_id_owner_status_fkey foreign key (owner_id, owner_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint media_assets_post_id_fkey foreign key (post_id) references nestly.posts (id) on delete set null (post_id, position),
  constraint media_assets_decided_by_fkey foreign key (decided_by) references nestly.users (id) on delete set null
);

create index media_assets_owner_idx on nestly.media_assets (owner_id, kind, created_at desc);
create index media_assets_work_idx on nestly.media_assets (status, created_at) where status in ('pending', 'queued');
create index media_assets_decided_by_idx on nestly.media_assets (decided_by) where decided_by is not null;

-- 2. profile_photos: media_status copies the image's status through the composite FK (the F2.4a pattern), so the policy asks "has the image
--    passed" without reading media_assets, whose own policy reads this table (no cycle).
create table nestly.profile_photos (
  user_id      uuid        not null default auth.uid(),
  user_status  text        not null default 'active',
  media_id     uuid        not null,
  media_status text        not null default 'pending',
  updated_at   timestamptz not null default now(),
  constraint profile_photos_pkey primary key (user_id),
  constraint profile_photos_media_id_key unique (media_id),
  constraint profile_photos_user_id_user_status_fkey foreign key (user_id, user_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint profile_photos_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete cascade
);

-- 3. stories.
create table nestly.stories (
  id            uuid        not null default gen_random_uuid(),
  author_id     uuid        not null default auth.uid(),
  author_status text        not null default 'active',
  media_id      uuid        not null,
  media_status  text        not null default 'pending',
  caption       text,
  audience      text        not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  constraint stories_pkey primary key (id),
  constraint stories_media_id_key unique (media_id),
  constraint stories_audience_check check (audience in ('everyone', 'friends')),
  constraint stories_caption_check check (caption is null or (btrim(caption) <> '' and char_length(caption) <= 500)),
  constraint stories_expires_check check (expires_at = created_at + interval '24 hours'),
  constraint stories_author_id_fkey foreign key (author_id) references nestly.regular_profiles (user_id) on delete cascade,
  constraint stories_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint stories_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete cascade
);

create index stories_author_idx on nestly.stories (author_id, created_at desc);
create index stories_expires_idx on nestly.stories (expires_at);

-- 4. media_training_samples: no user column (a sample names nobody); the file is at <bucket media-training>/<id>.
create table nestly.media_training_samples (
  id              uuid        not null default gen_random_uuid(),
  source_media_id uuid        not null,
  label           text        not null,
  source          text        not null,
  is_child        boolean     not null,
  mime            text        not null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '6 months',
  constraint media_training_samples_pkey primary key (id),
  constraint media_training_samples_source_key unique (source_media_id),
  constraint media_training_samples_label_check check (label in ('blocked', 'allowed')),
  constraint media_training_samples_source_check check (source in ('blocked', 'unsure', 'reported')),
  constraint media_training_samples_reported_check check (source <> 'reported' or (label = 'blocked' and decided_at is null)),
  constraint media_training_samples_decided_check check (source = 'reported' or decided_at is not null),
  constraint media_training_samples_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_training_samples_expires_check check (expires_at > created_at and expires_at <= created_at + interval '24 months')
);

-- media_training_events: the access record (Afik 20.10.2026: every access recorded). No user column.
create table nestly.media_training_events (
  id          uuid        not null default gen_random_uuid(),
  sample_id   uuid        not null,
  action      text        not null,
  source      text        not null,
  label       text        not null,
  occurred_at timestamptz not null default now(),
  constraint media_training_events_pkey primary key (id),
  constraint media_training_events_action_check check (action in ('added', 'expired')),
  constraint media_training_events_source_check check (source in ('blocked', 'unsure', 'reported')),
  constraint media_training_events_label_check check (label in ('blocked', 'allowed'))
);

create index media_training_events_occurred_idx on nestly.media_training_events (occurred_at desc);

create index media_training_samples_expires_idx on nestly.media_training_samples (expires_at);

-- 5. Triggers. SECURITY INVOKER; auth.uid() is the caller.

-- media_assets: who may change which column. The grants allow post_id, position, status and is_child to authenticated; this decides by whom.
create function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
begin
  if current_user = 'app_jobs' then
    if new.is_child is distinct from old.is_child or new.post_id is distinct from old.post_id or new.position is distinct from old.position then
      raise exception 'media: the job cannot decide' using errcode = '42501';
    end if;
    if old.status = 'rejected' then
      -- a rejected image's file is gone: the job records only that (Afik 20.10.2026)
      if new.status <> 'rejected' or not new.is_file_removed or new.scores is distinct from old.scores
         or new.check_attempts is distinct from old.check_attempts or new.queue_reason is distinct from old.queue_reason then
        raise exception 'media: the job only records a removed file' using errcode = '42501';
      end if;
      return new;
    end if;
    -- the background check: only a pending image moves, to passed or queued; it never decides as staff do
    if new.status not in ('pending', 'passed', 'queued') or new.is_file_removed then
      raise exception 'media: the check cannot decide' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then new.checked_at := pg_catalog.now(); end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status or new.is_child is distinct from old.is_child then
    -- a staff decision on a queued image (BR-076 as of 20.10.2026)
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if old.status <> 'queued' or new.status not in ('approved', 'rejected', 'suspected') then
      raise exception 'media: only a queued image is decided, as approved, rejected or suspected' using errcode = '23514';
    end if;
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    new.purge_after := case when new.status = 'suspected' then pg_catalog.now() + interval '90 days' end;
    if new.status = 'suspected' then new.is_child := true; end if;
    return new;
  end if;
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if old.post_id is not null or new.post_id is null or old.kind <> 'post' or old.status in ('rejected', 'suspected') then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  select exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = (select auth.uid()))
      or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid()))
    into v_mine;
  if not v_mine then
    raise exception 'media: the post is not yours' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function nestly.media_assets_update_guard() from public;

create trigger media_assets_update_guard
  before update on nestly.media_assets
  for each row execute function nestly.media_assets_update_guard();

-- profile_photos: the image is the caller's own profile image (not rejected or suspected); its status is copied.
create function nestly.profile_photos_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
begin
  select a.status, a.kind into m from nestly.media_assets a where a.id = new.media_id and a.owner_id = (select auth.uid());
  if not found or m.kind <> 'profile' or m.status in ('rejected', 'suspected') then
    raise exception 'profile photo: this image cannot be a profile photo' using errcode = '42501';
  end if;
  new.media_status := m.status;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- A replaced photo's image row goes at once (BR-077); the server removes the file after the commit.
create function nestly.profile_photos_replaced()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from nestly.media_assets where id = old.media_id;
  return null;
end
$$;

revoke execute on function nestly.profile_photos_prepare() from public;
revoke execute on function nestly.profile_photos_replaced() from public;

create trigger profile_photos_prepare
  before insert or update of media_id on nestly.profile_photos
  for each row execute function nestly.profile_photos_prepare();

create trigger profile_photos_replaced
  after update of media_id on nestly.profile_photos
  for each row when (old.media_id is distinct from new.media_id)
  execute function nestly.profile_photos_replaced();

-- stories: at most 10 per author in the last 24 hours (VAL-042), counted under a per-author transaction lock so two requests cannot both pass;
-- the image is the caller's own Story image, uploaded within the hour, not rejected or suspected. The clocks are the database's.
create function nestly.stories_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nestly.stories:' || (select auth.uid())::text, 0));
  if (select pg_catalog.count(*) from nestly.stories s
       where s.author_id = (select auth.uid()) and s.created_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'stories: at most 10 in 24 hours' using errcode = 'NS021';
  end if;
  select a.status, a.kind, a.created_at into m from nestly.media_assets a where a.id = new.media_id and a.owner_id = (select auth.uid());
  if not found or m.kind <> 'story' or m.status in ('rejected', 'suspected') or m.created_at < pg_catalog.now() - interval '1 hour' then
    raise exception 'stories: this image cannot be a Story' using errcode = '42501';
  end if;
  new.media_status := m.status;
  new.created_at := pg_catalog.now();
  new.expires_at := pg_catalog.now() + interval '24 hours';
  return new;
end
$$;

revoke execute on function nestly.stories_prepare() from public;

create trigger stories_prepare
  before insert on nestly.stories
  for each row execute function nestly.stories_prepare();

-- 6. RLS. Every client policy TO authenticated and gated by is_active_account(); the app_jobs ones are the check, the copy and the purge.
alter table nestly.media_assets enable row level security, force row level security;
alter table nestly.profile_photos enable row level security, force row level security;
alter table nestly.stories enable row level security, force row level security;
alter table nestly.media_training_samples enable row level security, force row level security;
alter table nestly.media_training_events enable row level security, force row level security;

-- media_assets: the uploader reads their own (a Story image only for its 24 hours).
create policy media_assets_select_owner on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid())
    and (kind <> 'story' or created_at > now() - interval '25 hours'));

-- Everyone else: an image that passed or was approved, through a post, profile photo or Story they can read (those tables' policies apply).
create policy media_assets_select_viewer on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_status = 'active' and status in ('passed', 'approved') and (
    (kind = 'post' and post_id is not null and exists (select 1 from nestly.posts p where p.id = media_assets.post_id))
    or (kind = 'profile' and exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id))
    or (kind = 'story' and exists (select 1 from nestly.stories s where s.media_id = media_assets.id))));

-- The approval queue (CONTENT_MODERATE; the Admin always): queued images and the decided ones (never a Story past its day).
create policy media_assets_select_staff on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and status in ('queued', 'approved', 'rejected', 'suspected')
    and (kind <> 'story' or created_at > now() - interval '25 hours'));

create policy media_assets_insert_owner on nestly.media_assets
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'pending' and post_id is null and position is null and not is_child
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

-- The uploader attaches an unattached post image to their post (the guard checks the post and the columns).
create policy media_assets_update_owner on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and post_id is null and kind = 'post')
  with check (owner_id = (select auth.uid()) and post_id is not null);

-- Staff decide a queued image (the guard sets who and when, and checks the move).
create policy media_assets_update_staff on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status = 'queued'
    and (kind <> 'story' or created_at > now() - interval '25 hours'))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and status in ('approved', 'rejected', 'suspected'));

-- The uploader removes their own image (a post image before or after posting; a Story goes with its image), never a suspected one.
create policy media_assets_delete_owner on nestly.media_assets
  for delete to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and status <> 'suspected');

-- The job role (rule 6): reads every row (the check, the copy, the purge and the sweep of files with no row); records a check result on a
-- pending image; deletes what BR-077 deletes.
create policy media_assets_select_jobs on nestly.media_assets
  for select to app_jobs
  using (true);

create policy media_assets_update_jobs on nestly.media_assets
  for update to app_jobs
  using (status = 'pending')
  with check (status in ('pending', 'passed', 'queued'));

-- A rejected image's file goes at once (Afik 20.10.2026), once its training copy exists where one is made (a blocked or unsure image).
create policy media_assets_update_jobs_file on nestly.media_assets
  for update to app_jobs
  using (status = 'rejected' and not is_file_removed
    and (queue_reason not in ('blocked', 'unsure')
      or exists (select 1 from nestly.media_training_samples t where t.source_media_id = media_assets.id)))
  with check (status = 'rejected' and is_file_removed);

create policy media_assets_delete_jobs on nestly.media_assets
  for delete to app_jobs
  using (
    (kind = 'story' and created_at <= now() - interval '25 hours'
      and not exists (select 1 from nestly.stories s where s.media_id = media_assets.id and s.expires_at > now()))
    or (status = 'suspected' and purge_after <= now())
    or (status = 'rejected' and decided_at <= now() - interval '30 days')
    or (kind = 'post' and post_id is null and created_at <= now() - interval '24 hours')
    or (kind = 'profile' and created_at <= now() - interval '24 hours'
      and not exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id)));

-- profile_photos: the owner reads their own in any image state; anyone active reads a passed or approved one (the Basic Public Profile, §1.4).
create policy profile_photos_select_viewer on nestly.profile_photos
  for select to authenticated
  using ((select nestly.is_active_account()) and user_status = 'active'
    and (user_id = (select auth.uid()) or media_status in ('passed', 'approved')));

create policy profile_photos_insert_owner on nestly.profile_photos
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()) and user_status = 'active'
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy profile_photos_update_owner on nestly.profile_photos
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy profile_photos_delete_owner on nestly.profile_photos
  for delete to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy profile_photos_select_jobs on nestly.profile_photos
  for select to app_jobs
  using (true);

-- stories: unexpired only; the author at once, others after the image passed, by audience (everyone, or accepted Friends).
create policy stories_select_viewer on nestly.stories
  for select to authenticated
  using ((select nestly.is_active_account()) and author_status = 'active' and expires_at > now() and (
    author_id = (select auth.uid())
    or (media_status in ('passed', 'approved') and (
      audience = 'everyone'
      or exists (
        select 1 from nestly.friendships f
        where f.status = 'accepted' and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = stories.author_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = stories.author_id)))))));

create policy stories_insert_author on nestly.stories
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_id = (select auth.uid()) and author_status = 'active'
    and (select nestly.caller_account_type()) = 'regular');

create policy stories_select_jobs on nestly.stories
  for select to app_jobs
  using (true);

-- media_training_samples: no client policy at all (no manual viewing, Afik 20.10.2026). Only the job writes: a sample of a blocked or unsure
-- image that staff approved or rejected (children included), or of a passed image whose post was removed after a report; never a suspected
-- one. It deletes expired samples. Every add and expiry is recorded in media_training_events by trigger.
create policy media_training_samples_select_jobs on nestly.media_training_samples
  for select to app_jobs
  using (true);

create policy media_training_samples_insert_jobs on nestly.media_training_samples
  for insert to app_jobs
  with check (exists (
    select 1 from nestly.media_assets m
    where m.id = media_training_samples.source_media_id
      and m.status <> 'suspected'
      and m.mime = media_training_samples.mime
      and m.is_child = media_training_samples.is_child
      and (
        (media_training_samples.source in ('blocked', 'unsure')
          and m.status in ('approved', 'rejected')
          and m.queue_reason = media_training_samples.source
          and (m.status = 'rejected') = (media_training_samples.label = 'blocked')
          and m.decided_at = media_training_samples.decided_at)
        or (media_training_samples.source = 'reported'
          and m.status in ('passed', 'approved')
          and exists (select 1 from nestly.posts p where p.id = m.post_id and p.status = 'removed')))));

create policy media_training_samples_delete_jobs on nestly.media_training_samples
  for delete to app_jobs
  using (expires_at <= now());

-- The job reads the posts removed after a report (whose images are model misses).
create policy posts_select_jobs_removed on nestly.posts
  for select to app_jobs
  using (status = 'removed');

-- media_training_events: the Admin and AUDIT_LOG_VIEW read; the job's trigger appends; nobody changes or deletes.
create policy media_training_events_select_audit on nestly.media_training_events
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('AUDIT_LOG_VIEW')));

create policy media_training_events_insert_jobs on nestly.media_training_events
  for insert to app_jobs
  with check (action in ('added', 'expired'));

create function nestly.media_training_samples_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into nestly.media_training_events (sample_id, action, source, label) values (new.id, 'added', new.source, new.label);
  else
    insert into nestly.media_training_events (sample_id, action, source, label) values (old.id, 'expired', old.source, old.label);
  end if;
  return null;
end
$$;

revoke execute on function nestly.media_training_samples_log() from public;

create trigger media_training_samples_log
  after insert or delete on nestly.media_training_samples
  for each row execute function nestly.media_training_samples_log();

-- 7. Grants. Per column: identifiers, owners, clocks, scores, counters and decisions are never written by a client.
revoke all on table nestly.media_assets, nestly.profile_photos, nestly.stories, nestly.media_training_samples, nestly.media_training_events from public, anon;

grant select (id, kind, status, mime, width, height, byte_size, post_id, position, is_child, queue_reason, scores, created_at, decided_at)
  on table nestly.media_assets to authenticated;
grant insert (kind, mime, width, height, byte_size) on table nestly.media_assets to authenticated;
grant update (post_id, position, status, is_child) on table nestly.media_assets to authenticated;
grant delete on table nestly.media_assets to authenticated;

grant select (user_id, media_id, media_status, updated_at) on table nestly.profile_photos to authenticated;
grant insert (media_id) on table nestly.profile_photos to authenticated;
grant update (media_id) on table nestly.profile_photos to authenticated;
grant delete on table nestly.profile_photos to authenticated;

grant select (id, author_id, media_id, media_status, caption, audience, created_at, expires_at) on table nestly.stories to authenticated;
grant insert (media_id, caption, audience) on table nestly.stories to authenticated;

grant select on table nestly.media_training_events to authenticated;

grant select, delete on table nestly.media_assets to app_jobs;
grant update (status, scores, check_attempts, queue_reason, is_file_removed) on table nestly.media_assets to app_jobs;
grant select on table nestly.profile_photos, nestly.stories to app_jobs;
grant select, delete on table nestly.media_training_samples to app_jobs;
grant insert (source_media_id, label, source, is_child, mime, decided_at, expires_at) on table nestly.media_training_samples to app_jobs;
grant insert (sample_id, action, source, label) on table nestly.media_training_events to app_jobs;

-- 8. The Audit Log: audit_trigger() gains the branch for a staff decision on an image (rule 18). The rest is unchanged.
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on a queued image. trainingSet: whether the image enters the training set
    -- (a blocked or unsure image, approved or rejected, children included; never a suspected one).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'isChild', v_new -> 'is_child',
      'queueReason', v_new ->> 'queue_reason',
      'trainingSet', (v_new ->> 'status') in ('approved', 'rejected') and coalesce((v_new ->> 'queue_reason') in ('blocked', 'unsure'), false));
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, or a staff decision on a queued image: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

create trigger media_assets_decision_audit
  after update of status on nestly.media_assets
  for each row
  when (old.status = 'queued' and new.status in ('approved', 'rejected', 'suspected'))
  execute function nestly.audit_trigger();

-- 9. Comments.
comment on table nestly.media_assets is
  'FR-FEED-002, FR-FEED-008, FR-PROFILE-001, NFR-MEDIA-001, BR-076 (Afik 20.10.2026): one uploaded image (post, profile photo or Story): metadata and the state of the background check. pending -> passed | queued; queued -> approved | rejected | suspected by CONTENT_MODERATE. Until passed or approved only the uploader reads it. The file is in private storage, never here.';
comment on column nestly.media_assets.id is 'The image; also its file name in the media bucket.';
comment on column nestly.media_assets.owner_id is 'The uploader (default auth.uid()). Never granted to a client: an anonymous post''s image must not name its author.';
comment on column nestly.media_assets.owner_status is 'Copy of the uploader''s users.status (composite FK, ON UPDATE CASCADE): a suspended uploader''s images are hidden. Never granted.';
comment on column nestly.media_assets.kind is 'post, profile or story.';
comment on column nestly.media_assets.status is 'pending (only the uploader sees it) · passed · queued (blocked, unsure or the check kept failing) · approved · rejected · suspected (a child may be in danger: hidden from everyone, deleted after 90 days).';
comment on column nestly.media_assets.mime is 'The stored format: the server re-encodes every upload (no EXIF or GPS, M4).';
comment on column nestly.media_assets.width is 'Pixels, at most 2,048 (VAL-041, AC-104).';
comment on column nestly.media_assets.height is 'Pixels, at most 2,048.';
comment on column nestly.media_assets.byte_size is 'Size of the stored file.';
comment on column nestly.media_assets.post_id is 'The post, set once by the uploader; NULL for a profile photo, a Story image or an image not attached yet. Set NULL when the post row goes (the purge then removes the image).';
comment on column nestly.media_assets.position is 'Order in the post, 0 to 3: at most 4 images per post (VAL-041), by the unique (post_id, position).';
comment on column nestly.media_assets.is_child is 'Marked by staff in the queue: "a child is in the image". Metadata, copied to a training sample (Afik 20.10.2026).';
comment on column nestly.media_assets.queue_reason is 'Why it was queued: blocked (a covered part exposed above the block threshold), unsure (between the thresholds) or error (the check kept failing). NULL if never queued.';
comment on column nestly.media_assets.scores is 'The model''s highest score per label it checks, for the queue. Set by the job only.';
comment on column nestly.media_assets.check_attempts is 'Failed checks so far; at the limit the job queues the image (fail closed). Never granted to a client.';
comment on column nestly.media_assets.checked_at is 'When the check moved the image (set by the guard).';
comment on column nestly.media_assets.decided_by is 'The staff member who decided (set by the guard; NULL once that account is gone).';
comment on column nestly.media_assets.decided_at is 'When it was decided (set by the guard).';
comment on column nestly.media_assets.purge_after is 'A suspected image: 90 days after the decision, then deleted (M6).';
comment on column nestly.media_assets.created_at is 'Upload time.';
comment on table nestly.profile_photos is 'FR-PROFILE-001: the current photo of a Regular or Professional account; replacing it deletes the previous image row at once (BR-077). The owner reads it in any state; others once the image passed or was approved.';
comment on column nestly.profile_photos.user_id is 'The account (default auth.uid()).';
comment on column nestly.profile_photos.user_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.profile_photos.media_id is 'The current image (kind profile, the caller''s own).';
comment on column nestly.profile_photos.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): the policy''s "has it passed". Set by the trigger.';
comment on column nestly.profile_photos.updated_at is 'When the photo was set.';
comment on table nestly.stories is 'FR-FEED-008: a Story, one image and optional text for 24 hours; at most 10 per author in 24 hours (stories_prepare, VAL-042, ERR-040). Regular accounts only, never anonymous. The author sees it at once, the audience after the image passed.';
comment on column nestly.stories.id is 'The Story.';
comment on column nestly.stories.author_id is 'The author (a Regular profile; default auth.uid()).';
comment on column nestly.stories.author_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.stories.media_id is 'The Story''s image (kind story, the author''s, uploaded within the hour); the Story goes with it.';
comment on column nestly.stories.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): others see the Story only after the image passed or was approved.';
comment on column nestly.stories.caption is 'Optional text, 1 to 500 characters in the database; the product limit is VAL-042''s.';
comment on column nestly.stories.audience is 'everyone or friends (OP-033).';
comment on column nestly.stories.created_at is 'Set by the trigger to the transaction time.';
comment on column nestly.stories.expires_at is 'created_at + 24 hours (set by the trigger); the policy hides the Story from then on and the job deletes it.';
comment on table nestly.media_training_samples is 'Afik 20.10.2026: the index of the training set, used only to train the safety model: images the model blocked or was unsure about (children included) with the staff decision, and passed images whose post was removed after a report. Files in a separate private bucket the job alone reaches. Never a suspected image; no client reads it; deleted at expiry.';
comment on column nestly.media_training_samples.id is 'The sample; also its file name in the training bucket.';
comment on column nestly.media_training_samples.source_media_id is 'The image it was copied from (no foreign key: the sample outlives it).';
comment on column nestly.media_training_samples.label is 'blocked (staff rejected it) or allowed (staff approved it).';
comment on column nestly.media_training_samples.source is 'Why it is a sample: the model blocked it, was unsure, or it passed and its post was removed after a report (reported).';
comment on column nestly.media_training_samples.is_child is 'Copy of the image''s "a child is in the image" mark (metadata; it does not exclude the image, Afik 20.10.2026).';
comment on column nestly.media_training_samples.mime is 'Format of the file.';
comment on column nestly.media_training_samples.decided_at is 'When staff decided (copied from the image); NULL for a reported sample.';
comment on column nestly.media_training_samples.created_at is 'When the job copied it.';
comment on column nestly.media_training_samples.expires_at is 'Deleted after this time: set by the job from its configuration (6 months by default, Afik 20.10.2026); at most 24 months.';
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the job moves a pending image to passed or queued and records a rejected image''s removed file; staff with CONTENT_MODERATE decide a queued one (who and when set here; suspected = 90 days, child marked); the uploader attaches an unattached post image to a post of their own.';
comment on function nestly.profile_photos_prepare() is 'SECURITY INVOKER. The image must be the caller''s own profile image, not rejected or suspected; copies its status.';
comment on function nestly.profile_photos_replaced() is 'SECURITY INVOKER. A replaced profile photo''s image row is deleted at once (BR-077).';
comment on function nestly.stories_prepare() is 'SECURITY INVOKER. At most 10 Stories in 24 hours per author under a per-author lock (NS021, ERR-040); the image is the caller''s Story image from the last hour (42501); sets the clocks.';
comment on policy media_assets_select_owner on nestly.media_assets is 'The uploader reads their own images (a Story image for its day).';
comment on policy media_assets_select_viewer on nestly.media_assets is 'Others read an image only after it passed or was approved, through a post, profile photo or Story they can read.';
comment on policy media_assets_select_staff on nestly.media_assets is 'CONTENT_MODERATE reads the queue and the decided images (never the uploader: owner_id is not granted).';
comment on policy media_assets_insert_owner on nestly.media_assets is 'A Regular or Professional uploads, always pending and unattached.';
comment on policy media_assets_update_owner on nestly.media_assets is 'The uploader attaches an unattached post image to their post; the guard checks the rest.';
comment on policy media_assets_update_staff on nestly.media_assets is 'CONTENT_MODERATE decides a queued image.';
comment on policy media_assets_delete_owner on nestly.media_assets is 'The uploader deletes their own image, never a suspected one.';
comment on policy media_assets_select_jobs on nestly.media_assets is 'The job role reads every image row: the check, the training copy, the file removal, the purge and the sweep of files with no row (rule 6).';
comment on policy media_assets_update_jobs on nestly.media_assets is 'The job role records the check result on a pending image (rule 6).';
comment on policy media_assets_delete_jobs on nestly.media_assets is 'The purge (BR-077): expired Stories, suspected images after 90 days, rejected after 30 days, unattached post images after 24 hours (a deleted post's row going sets them unattached), replaced or unused profile images after 24 hours.';
comment on policy profile_photos_select_viewer on nestly.profile_photos is 'The owner always; others once the image passed or was approved.';
comment on policy profile_photos_insert_owner on nestly.profile_photos is 'A Regular or Professional sets their own photo.';
comment on policy profile_photos_update_owner on nestly.profile_photos is 'Replaces the own photo.';
comment on policy profile_photos_delete_owner on nestly.profile_photos is 'Removes the own photo.';
comment on policy profile_photos_select_jobs on nestly.profile_photos is 'The purge reads which profile images are current (rule 6).';
comment on policy stories_select_viewer on nestly.stories is 'Unexpired Stories: the author at once, others after the image passed or was approved, by audience (everyone or accepted Friends).';
comment on policy stories_insert_author on nestly.stories is 'A Regular publishes as themselves.';
comment on policy stories_select_jobs on nestly.stories is 'The purge reads which Story images are still live (rule 6).';
comment on policy media_training_samples_select_jobs on nestly.media_training_samples is 'The job reads the index (what is copied, what expired).';
comment on policy media_training_samples_insert_jobs on nestly.media_training_samples is 'The job adds a sample of a blocked or unsure image staff approved or rejected (children included), or of a passed image whose post was removed after a report; never a suspected one.';
comment on policy media_assets_update_jobs_file on nestly.media_assets is 'The job records that a rejected image''s file is removed, once its training copy exists where one is made.';
comment on policy posts_select_jobs_removed on nestly.posts is 'The job reads posts removed after a report: their images are training samples (model misses).';
comment on policy media_training_events_select_audit on nestly.media_training_events is 'The Admin and AUDIT_LOG_VIEW read the training set''s access record.';
comment on policy media_training_events_insert_jobs on nestly.media_training_events is 'The job''s trigger appends an add or an expiry.';
comment on table nestly.media_training_events is 'Afik 20.10.2026: the access record of the training set (every sample added or expired), written by trigger in the same transaction. Append-only; names no user.';
comment on column nestly.media_training_events.id is 'The record.';
comment on column nestly.media_training_events.sample_id is 'The sample (no foreign key: the record outlives it).';
comment on column nestly.media_training_events.action is 'added or expired.';
comment on column nestly.media_training_events.source is 'The sample''s source.';
comment on column nestly.media_training_events.label is 'The sample''s label.';
comment on column nestly.media_training_events.occurred_at is 'When.';
comment on index nestly.media_training_events_occurred_idx is 'The record, newest first.';
comment on function nestly.media_training_samples_log() is 'SECURITY INVOKER (runs as the job). Appends the access record of every training sample added or expired.';
comment on column nestly.media_assets.is_file_removed is 'A rejected image whose file the job removed (after its training copy). The row stays 30 days so the uploader sees the rejection.';
comment on policy media_training_samples_delete_jobs on nestly.media_training_samples is 'The job deletes expired samples.';
comment on index nestly.media_assets_owner_idx is 'The uploader''s images by kind.';
comment on index nestly.media_assets_work_idx is 'The check job and the approval queue.';
comment on index nestly.media_assets_decided_by_idx is 'The SET NULL on a users delete.';
comment on index nestly.stories_author_idx is 'The 10-in-24-hours count and an author''s Stories.';
comment on index nestly.stories_expires_idx is 'The Stories tray and the purge.';
comment on index nestly.media_training_samples_expires_idx is 'The expiry job.';
