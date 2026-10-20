-- =====================================================================================================================
-- Images, profile photos, Stories, the image approval queue and the training set -- I5 (media and Stories), migration only.
--
-- SRS: FR-FEED-002 · FR-PROFILE-001 · FR-FEED-008 · FR-REL-002 (blocks) · NFR-MEDIA-001 · BR-076 (as replaced by Afik's image policy of 20.10.2026,
--      decisions-in-force.md §2) · BR-077 · VAL-041 · VAL-042 · ERR-040 · AC-021, AC-102..105; storage and jobs: decisions-in-force.md §7;
--      platform rules 1, 6, 8, 10, 12, 13, 15, 16, 18 (data-model.md).
--
-- The image files are never in the database: they are in private storage, reached only by the server's storage module. These tables hold
-- what the policies need to decide who may see an image, and the state of the background check and of staff review.
--
-- media_assets            one row per uploaded image (post, profile, story). status: pending -> passed | queued; queued -> approved |
--                         rejected. A suspicion of child abuse is stored as `rejected` with is_held (never readable by a client), so the
--                         uploader sees exactly an ordinary rejection; a held image is kept 90 days (M6) and never purged early. Staff may
--                         also reject a passed image after a report, so a passed image turning rejected tells the uploader nothing. Only the
--                         uploader reads an unchecked image; others read a passed or approved one, only through a post, profile photo or
--                         Story they can read. owner_id, is_held, check_attempts, decided_* and is_file_removed are not readable by a client.
-- media_reviews           staff-only: why an image was queued (blocked / unsure / error), the model's scores, the "יש בתמונה ילד" mark, and a
--                         suspicion (who, when, purge after 90 days). CONTENT_MODERATE reads it; the job writes the queue reason.
-- profile_photos          the current photo of a Regular or Professional account; replacing it deletes the old image row at once (BR-077),
--                         unless that image is queued or rejected (the job removes those later).
-- stories                 FR-FEED-008: one image, optional text (<= 200, VAL-042), audience, visible 24 hours; at most 10 per author in
--                         24 hours counted on Story rows (a Story whose image was deleted stays as a tombstone until it expires).
-- media_training_candidates  images removed after a handled report that is not a child-safety report (the post removed, or the image
--                         rejected by staff after it had passed): model misses. Written by the moderator's own transaction.
-- media_training_samples  the training set's index (Afik 20.10.2026): images the model blocked or was unsure about, children included, with the
--                         staff decision, and passed images of a candidate post. Never a held image (and removed when one becomes held). No
--                         client reads it (no manual viewing). Kept exactly 6 months.
-- media_training_events   the access record of the training set: added / expired / removed by trigger, accessed by the job with its purpose
--                         before it reads a file; each event names a real sample.
--
-- The job role app_media_jobs (bootstrap step 1; rule 6) reaches these tables only through TO app_media_jobs policies and column grants.
-- audit_trigger() (rule 18) gains one branch for staff decisions and suspicions; the rest is the text of 20261021300000, unchanged.
-- No new SECURITY DEFINER function. Phase: expand. Down script: supabase/rollback/20261021500000_media_stories.down.sql.
-- =====================================================================================================================

-- 1. Tables -----------------------------------------------------------------------------------------------------------------------
create table nestly.media_assets (
  id              uuid        not null default gen_random_uuid(),
  owner_id        uuid        default auth.uid(),
  owner_status    text        not null default 'active',
  kind            text        not null,
  status          text        not null default 'pending',
  mime            text        not null,
  width           integer     not null,
  height          integer     not null,
  byte_size       integer     not null,
  post_id         uuid,
  position        smallint,
  is_held         boolean     not null default false,
  check_attempts  smallint    not null default 0,
  checked_at      timestamptz,
  decided_by      uuid,
  decided_at      timestamptz,
  is_file_removed boolean     not null default false,
  created_at      timestamptz not null default now(),
  constraint media_assets_pkey primary key (id),
  constraint media_assets_id_status_key unique (id, status),
  constraint media_assets_id_owner_id_key unique (id, owner_id),
  constraint media_assets_post_id_position_key unique (post_id, position),
  constraint media_assets_kind_check check (kind in ('post', 'profile', 'story')),
  constraint media_assets_status_check check (status in ('pending', 'passed', 'queued', 'approved', 'rejected')),
  constraint media_assets_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_assets_width_check check (width between 1 and 2048),
  constraint media_assets_height_check check (height between 1 and 2048),
  constraint media_assets_byte_size_check check (byte_size between 1 and 5242880),
  constraint media_assets_position_check check (position is null or position between 0 and 3),
  constraint media_assets_post_kind_check check (post_id is null or kind = 'post'),
  constraint media_assets_post_position_check check (post_id is null or position is not null),
  constraint media_assets_decided_check check ((status in ('approved', 'rejected')) = (decided_at is not null)),
  constraint media_assets_held_check check (not is_held or status = 'rejected'),
  constraint media_assets_file_removed_check check (not is_file_removed or (status = 'rejected' and not is_held)),
  constraint media_assets_attempts_check check (check_attempts between 0 and 20),
  constraint media_assets_owner_fkey foreign key (owner_id, owner_status)
    references nestly.users (id, status) on update cascade on delete set null (owner_id),
  constraint media_assets_post_id_fkey foreign key (post_id) references nestly.posts (id) on delete set null (post_id),
  constraint media_assets_decided_by_fkey foreign key (decided_by) references nestly.users (id) on delete set null
);

create index media_assets_owner_idx on nestly.media_assets (owner_id, kind, created_at desc);
create index media_assets_work_idx on nestly.media_assets (status, created_at) where status in ('pending', 'queued');
create index media_assets_post_idx on nestly.media_assets (post_id) where post_id is not null;
create index media_assets_decided_by_idx on nestly.media_assets (decided_by) where decided_by is not null;

create table nestly.media_reviews (
  media_id      uuid        not null,
  queue_reason  text,
  scores        jsonb,
  is_child      boolean     not null default false,
  is_suspected  boolean     not null default false,
  suspected_by  uuid,
  suspected_at  timestamptz,
  purge_after   timestamptz,
  created_at    timestamptz not null default now(),
  constraint media_reviews_pkey primary key (media_id),
  constraint media_reviews_queue_reason_check check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error')),
  constraint media_reviews_reason_or_suspicion_check check (queue_reason is not null or is_suspected),
  constraint media_reviews_suspected_check check (is_suspected = (suspected_at is not null) and is_suspected = (purge_after is not null)),
  constraint media_reviews_media_id_fkey foreign key (media_id) references nestly.media_assets (id) on delete cascade,
  constraint media_reviews_suspected_by_fkey foreign key (suspected_by) references nestly.users (id) on delete set null
);

create index media_reviews_suspected_idx on nestly.media_reviews (purge_after) where is_suspected;
create index media_reviews_suspected_by_idx on nestly.media_reviews (suspected_by) where suspected_by is not null;

create table nestly.profile_photos (
  user_id      uuid        not null default auth.uid(),
  user_status  text        not null default 'active',
  media_id     uuid        not null,
  media_status text        not null default 'pending',
  updated_at   timestamptz not null default now(),
  constraint profile_photos_pkey primary key (user_id),
  constraint profile_photos_media_id_key unique (media_id),
  constraint profile_photos_user_fkey foreign key (user_id, user_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint profile_photos_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete cascade,
  constraint profile_photos_media_owner_fkey foreign key (media_id, user_id) references nestly.media_assets (id, owner_id) on delete cascade
);

create table nestly.stories (
  id            uuid        not null default gen_random_uuid(),
  author_id     uuid        not null default auth.uid(),
  author_status text        not null default 'active',
  media_id      uuid,
  media_status  text        default 'pending',
  caption       text,
  audience      text        not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  constraint stories_pkey primary key (id),
  constraint stories_media_id_key unique (media_id),
  constraint stories_media_pair_check check ((media_id is null) = (media_status is null)),
  constraint stories_audience_check check (audience in ('everyone', 'friends')),
  constraint stories_caption_check check (caption is null or (btrim(caption) <> '' and char_length(caption) <= 200)),
  constraint stories_expires_check check (expires_at = created_at + interval '24 hours'),
  constraint stories_author_id_fkey foreign key (author_id) references nestly.regular_profiles (user_id) on delete cascade,
  constraint stories_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint stories_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete set null,
  constraint stories_media_owner_fkey foreign key (media_id, author_id) references nestly.media_assets (id, owner_id) on delete set null (media_id)
);

create index stories_author_idx on nestly.stories (author_id, created_at desc);
create index stories_expires_idx on nestly.stories (expires_at);

create table nestly.media_training_candidates (
  media_id   uuid        not null,
  created_at timestamptz not null default now(),
  constraint media_training_candidates_pkey primary key (media_id),
  constraint media_training_candidates_media_id_fkey foreign key (media_id) references nestly.media_assets (id) on delete cascade
);

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
  constraint media_training_samples_expires_check check (expires_at = created_at + interval '6 months')
);

create index media_training_samples_expires_idx on nestly.media_training_samples (expires_at);

create table nestly.media_training_events (
  id          uuid        not null default gen_random_uuid(),
  sample_id   uuid        not null,
  action      text        not null,
  purpose     text,
  source      text        not null,
  label       text        not null,
  occurred_at timestamptz not null default now(),
  constraint media_training_events_pkey primary key (id),
  constraint media_training_events_action_check check (action in ('added', 'expired', 'removed', 'accessed')),
  constraint media_training_events_purpose_check check ((action = 'accessed') = (purpose is not null) and (purpose is null or purpose in ('training'))),
  constraint media_training_events_source_check check (source in ('blocked', 'unsure', 'reported')),
  constraint media_training_events_label_check check (label in ('blocked', 'allowed'))
);

create unique index media_training_events_added_key on nestly.media_training_events (sample_id) where action = 'added';
create unique index media_training_events_ended_key on nestly.media_training_events (sample_id) where action in ('expired', 'removed');
create index media_training_events_sample_idx on nestly.media_training_events (sample_id);
create index media_training_events_occurred_idx on nestly.media_training_events (occurred_at desc);

-- 2. Triggers (SECURITY INVOKER; auth.uid() is the caller; current_user tells the job from a client) ------------------------------
create function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
  v_suspected boolean;
begin
  if new.is_held is distinct from old.is_held and current_user <> 'authenticated' then
    raise exception 'media: only a staff decision holds an image' using errcode = '42501';
  end if;
  if current_user = 'app_media_jobs' then
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position or new.decided_at is distinct from old.decided_at then
      raise exception 'media: the job cannot decide' using errcode = '42501';
    end if;
    if old.status = 'rejected' then
      -- a rejected image's file is gone: the job records only that (Afik 20.10.2026)
      if new.status <> 'rejected' or not new.is_file_removed or new.check_attempts <> old.check_attempts then
        raise exception 'media: the job only records a removed file' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'pending' or new.status not in ('pending', 'passed', 'queued') or new.is_file_removed or new.check_attempts < old.check_attempts then
      raise exception 'media: the check moves only a pending image, to passed or queued' using errcode = '42501';
    end if;
    if new.status = 'queued' and not exists (select 1 from nestly.media_reviews r where r.media_id = new.id and r.queue_reason is not null) then
      raise exception 'media: a queued image has its reason first' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then new.checked_at := pg_catalog.now(); end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status then
    -- a staff decision (BR-076 as of 20.10.2026): a queued image approved or rejected; a passed or approved one rejected only as a suspicion
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    select coalesce(bool_or(r.is_suspected), false) into v_suspected from nestly.media_reviews r where r.media_id = new.id;
    if old.status = 'queued' and new.status in ('approved', 'rejected') then
      if v_suspected and new.status <> 'rejected' then
        raise exception 'media: a suspected image is rejected' using errcode = '23514';
      end if;
    elsif old.status in ('passed', 'approved') and new.status = 'rejected' then
      -- after a report on its post or its uploader, or as a suspicion (the uploader sees the same rejection either way)
      if not (select nestly.has_permission('REPORTS_VIEW')) or not (v_suspected
          or exists (select 1 from nestly.reports r where (old.post_id is not null and r.post_id = old.post_id) or r.reported_user_id = old.owner_id)) then
        raise exception 'media: a checked image is removed only after a report or as a suspicion' using errcode = '42501';
      end if;
    else
      raise exception 'media: not a decision' using errcode = '23514';
    end if;
    new.is_held := v_suspected;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    return new;
  end if;
  if new.is_held is distinct from old.is_held then
    raise exception 'media: only a decision holds an image' using errcode = '42501';
  end if;
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if old.post_id is not null or new.post_id is null or old.kind <> 'post' or old.status = 'rejected' then
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

create trigger media_assets_update_guard
  before update on nestly.media_assets
  for each row execute function nestly.media_assets_update_guard();

-- media_reviews: the job writes the queue reason and scores once; staff mark a child or a suspicion (who, when, 90 days set here); a
-- suspicion is never withdrawn.
create function nestly.media_reviews_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'app_media_jobs' then
    if tg_op <> 'INSERT' or new.is_child or new.is_suspected then
      raise exception 'media_reviews: the job records the queue reason only' using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.queue_reason is distinct from old.queue_reason or new.scores is distinct from old.scores
      or (old.is_suspected and not new.is_suspected)) then
    raise exception 'media_reviews: staff mark a child or a suspicion only' using errcode = '42501';
  end if;
  if new.is_suspected and (tg_op = 'INSERT' or not old.is_suspected) then
    new.suspected_by := (select auth.uid());
    new.suspected_at := pg_catalog.now();
    new.purge_after := pg_catalog.now() + interval '90 days';
  elsif tg_op = 'UPDATE' then
    new.suspected_by := old.suspected_by;
    new.suspected_at := old.suspected_at;
    new.purge_after := old.purge_after;
  end if;
  return new;
end
$$;

create trigger media_reviews_guard
  before insert or update on nestly.media_reviews
  for each row execute function nestly.media_reviews_guard();

create function nestly.profile_photos_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
begin
  if tg_op = 'UPDATE' and new.media_id = old.media_id then
    return new;  -- the image's own status moving (the composite FK cascades it here): nothing to check
  end if;
  -- the row as the caller's policies show it; that it is the caller's own is profile_photos_media_owner_fkey's check (owner_id is not granted)
  select a.status, a.kind into m from nestly.media_assets a where a.id = new.media_id;
  if not found or m.kind <> 'profile' or m.status = 'rejected' then
    raise exception 'profile photo: this image cannot be a profile photo' using errcode = '42501';
  end if;
  new.media_status := m.status;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- A replaced photo's image row goes at once (BR-077) when its owner may delete it (never a queued or rejected one: the owner's delete policy).
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

create trigger profile_photos_prepare
  before insert or update of media_id on nestly.profile_photos
  for each row execute function nestly.profile_photos_prepare();

create trigger profile_photos_replaced
  after update of media_id on nestly.profile_photos
  for each row when (old.media_id is distinct from new.media_id)
  execute function nestly.profile_photos_replaced();

-- stories: at most 10 per author in 24 hours, counted on Story rows (tombstones included) under a per-author transaction lock; the image is
-- the caller's own Story image from the last hour, not rejected. The clocks are the database's.
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
  -- that the image is the caller's own is stories_media_owner_fkey's check (owner_id is not granted)
  select a.status, a.kind, a.created_at into m from nestly.media_assets a where a.id = new.media_id;
  if not found or m.kind <> 'story' or m.status = 'rejected' or m.created_at < pg_catalog.now() - interval '1 hour' then
    raise exception 'stories: this image cannot be a Story' using errcode = '42501';
  end if;
  new.media_status := m.status;
  new.created_at := pg_catalog.now();
  new.expires_at := pg_catalog.now() + interval '24 hours';
  return new;
end
$$;

create trigger stories_prepare
  before insert on nestly.stories
  for each row execute function nestly.stories_prepare();

-- Training candidates (Afik 20.10.2026: images removed after a report are model misses). Runs in the moderator's transaction, as the
-- moderator, when a post report is handled with action taken or a reported post is removed: every image of that post that the model passed
-- and that is now removed (the post removed, or the image rejected from passed) becomes a candidate, unless any report on the post is a
-- child-safety report or the image is suspected. The insert policy checks all of it again.
create function nestly.media_training_candidate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post uuid;
begin
  if tg_table_name = 'reports' then v_post := new.post_id; else v_post := new.id; end if;
  if current_user <> 'authenticated' or v_post is null
     or not (select nestly.has_permission('REPORTS_VIEW')) or not (select nestly.has_permission('CONTENT_MODERATE')) then
    return null;
  end if;
  insert into nestly.media_training_candidates (media_id)
  select m.id
    from nestly.media_assets m
   where m.post_id = v_post
     and exists (select 1 from nestly.reports r where r.post_id = v_post and r.status = 'handled' and r.resolution = 'action_taken')
     and not exists (select 1 from nestly.reports r where r.post_id = v_post and r.reason = 'child_safety')
     and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
     and (m.status = 'rejected' or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = v_post and p.status = 'removed')))
  on conflict do nothing;
  return null;
end
$$;

create trigger reports_training_candidate
  after update of status on nestly.reports
  for each row when (new.status = 'handled' and old.status = 'open' and new.resolution = 'action_taken' and new.post_id is not null)
  execute function nestly.media_training_candidate();

create trigger posts_training_candidate
  after update of status on nestly.posts
  for each row when (new.status = 'removed' and old.status is distinct from 'removed')
  execute function nestly.media_training_candidate();

-- The training set's access record: every add and every removal, in the same transaction, as the job.
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
    insert into nestly.media_training_events (sample_id, action, source, label)
    values (old.id, case when old.expires_at <= pg_catalog.now() then 'expired' else 'removed' end, old.source, old.label);
  end if;
  return null;
end
$$;

create trigger media_training_samples_log
  after insert or delete on nestly.media_training_samples
  for each row execute function nestly.media_training_samples_log();

revoke execute on function nestly.media_assets_update_guard(), nestly.media_reviews_guard(), nestly.profile_photos_prepare(),
  nestly.profile_photos_replaced(), nestly.stories_prepare(), nestly.media_training_candidate(), nestly.media_training_samples_log() from public;

-- 3. RLS. Every client policy is TO authenticated and gated by is_active_account(); the TO app_media_jobs ones are the check, the training
-- copy and the purge (rule 6).
alter table nestly.media_assets enable row level security, force row level security;
alter table nestly.media_reviews enable row level security, force row level security;
alter table nestly.profile_photos enable row level security, force row level security;
alter table nestly.stories enable row level security, force row level security;
alter table nestly.media_training_candidates enable row level security, force row level security;
alter table nestly.media_training_samples enable row level security, force row level security;
alter table nestly.media_training_events enable row level security, force row level security;

-- media_assets ------------------------------------------------------------------------------------------------------------------
create policy media_assets_select_owner on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid())
    and (kind <> 'story' or created_at > now() - interval '25 hours'));

create policy media_assets_select_viewer on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_status = 'active' and status in ('passed', 'approved') and (
    (kind = 'post' and post_id is not null and exists (select 1 from nestly.posts p where p.id = media_assets.post_id))
    or (kind = 'profile' and exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id))
    or (kind = 'story' and exists (select 1 from nestly.stories s where s.media_id = media_assets.id))));

create policy media_assets_select_staff on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and status in ('queued', 'approved', 'rejected'));

create policy media_assets_insert_owner on nestly.media_assets
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'pending' and post_id is null and position is null and not is_held and not is_file_removed
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy media_assets_update_owner on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and post_id is null and kind = 'post')
  with check (owner_id = (select auth.uid()) and post_id is not null);

create policy media_assets_update_staff on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and (status = 'queued' or (status in ('passed', 'approved') and (select nestly.has_permission('REPORTS_VIEW')))))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('approved', 'rejected'));

create policy media_assets_delete_owner on nestly.media_assets
  for delete to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and status not in ('queued', 'rejected'));

create policy media_assets_select_jobs on nestly.media_assets
  for select to app_media_jobs
  using (true);

create policy media_assets_update_jobs on nestly.media_assets
  for update to app_media_jobs
  using (status = 'pending')
  with check (status in ('pending', 'passed', 'queued'));

create policy media_assets_update_jobs_file on nestly.media_assets
  for update to app_media_jobs
  using (status = 'rejected' and not is_file_removed and not is_held
    and (exists (select 1 from nestly.media_training_samples t where t.source_media_id = media_assets.id)
      or (not exists (select 1 from nestly.media_reviews r where r.media_id = media_assets.id and r.queue_reason in ('blocked', 'unsure'))
        and not exists (select 1 from nestly.media_training_candidates c where c.media_id = media_assets.id))))
  with check (status = 'rejected' and is_file_removed);

create policy media_assets_delete_jobs on nestly.media_assets
  for delete to app_media_jobs
  using (
    (is_held and exists (select 1 from nestly.media_reviews r where r.media_id = media_assets.id and r.purge_after <= now()))
    or (not is_held and status <> 'queued' and (status <> 'rejected' or is_file_removed) and (
      (kind = 'story' and created_at <= now() - interval '25 hours'
        and not exists (select 1 from nestly.stories s where s.media_id = media_assets.id and s.expires_at > now()))
      or (status = 'rejected' and decided_at <= now() - interval '30 days')
      or (kind = 'post' and post_id is null and created_at <= now() - interval '24 hours')
      or (kind = 'profile' and created_at <= now() - interval '24 hours'
        and not exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id)))));

-- media_reviews (staff only) ------------------------------------------------------------------------------------------------------
create policy media_reviews_select_staff on nestly.media_reviews
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')));

create policy media_reviews_update_staff on nestly.media_reviews
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.media_assets m where m.id = media_reviews.media_id
                and (m.status = 'queued' or (m.status in ('passed', 'approved') and (select nestly.has_permission('REPORTS_VIEW'))))))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')));

create policy media_reviews_insert_staff on nestly.media_reviews
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and (select nestly.has_permission('REPORTS_VIEW')) and is_suspected and queue_reason is null and scores is null
    and exists (select 1 from nestly.media_assets m where m.id = media_reviews.media_id and m.status in ('passed', 'approved')));

create policy media_reviews_select_jobs on nestly.media_reviews
  for select to app_media_jobs
  using (true);

create policy media_reviews_insert_jobs on nestly.media_reviews
  for insert to app_media_jobs
  with check (queue_reason is not null and not is_child and not is_suspected
    and exists (select 1 from nestly.media_assets m where m.id = media_reviews.media_id and m.status = 'pending'));

-- profile_photos ------------------------------------------------------------------------------------------------------------------
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
  for select to app_media_jobs
  using (true);

-- stories -------------------------------------------------------------------------------------------------------------------------
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
    and media_id is not null and (select nestly.caller_account_type()) = 'regular');

create policy stories_select_jobs on nestly.stories
  for select to app_media_jobs
  using (true);

create policy stories_delete_jobs on nestly.stories
  for delete to app_media_jobs
  using (expires_at <= now());

-- Blocking (FR-REL-002, 20261021250000): RESTRICTIVE, AND-ed with the policies above, as on posts and comments. A blocked pair sees
-- neither's Stories nor profile photo (so neither's image through them either: media_assets_select_viewer reads these tables under RLS).
create policy stories_block_hide on nestly.stories
  as restrictive for select to authenticated
  using (author_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW')) or author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])));

create policy profile_photos_block_hide on nestly.profile_photos
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW')) or user_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])));

-- media_training_candidates -------------------------------------------------------------------------------------------------------
create policy media_training_candidates_insert_staff on nestly.media_training_candidates
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (
      select 1 from nestly.media_assets m
      where m.id = media_training_candidates.media_id and m.post_id is not null
        and exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.status = 'handled' and r.resolution = 'action_taken')
        and not exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.reason = 'child_safety')
        and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
        and (m.status = 'rejected'
          or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = m.post_id and p.status = 'removed')))));

create policy media_training_candidates_select_jobs on nestly.media_training_candidates
  for select to app_media_jobs
  using (true);

-- media_training_samples: no client policy at all (no manual viewing, Afik 20.10.2026) --------------------------------------------
create policy media_training_samples_select_jobs on nestly.media_training_samples
  for select to app_media_jobs
  using (true);

create policy media_training_samples_insert_jobs on nestly.media_training_samples
  for insert to app_media_jobs
  with check (exists (
    select 1 from nestly.media_assets m
    where m.id = media_training_samples.source_media_id
      and not m.is_held
      and m.mime = media_training_samples.mime
      and not exists (select 1 from nestly.media_reviews s where s.media_id = m.id and s.is_suspected)
      and (
        (media_training_samples.source in ('blocked', 'unsure')
          and m.status in ('approved', 'rejected')
          and (m.status = 'rejected') = (media_training_samples.label = 'blocked')
          and m.decided_at = media_training_samples.decided_at
          and exists (select 1 from nestly.media_reviews r where r.media_id = m.id and r.queue_reason = media_training_samples.source
                        and r.is_child = media_training_samples.is_child))
        or (media_training_samples.source = 'reported'
          and m.status in ('passed', 'approved', 'rejected')
          and not media_training_samples.is_child
          and exists (select 1 from nestly.media_training_candidates c where c.media_id = m.id)))));

create policy media_training_samples_delete_jobs on nestly.media_training_samples
  for delete to app_media_jobs
  using (expires_at <= now()
    or exists (select 1 from nestly.media_assets m where m.id = media_training_samples.source_media_id and m.is_held)
    or exists (select 1 from nestly.media_reviews r where r.media_id = media_training_samples.source_media_id and r.is_suspected));

-- media_training_events: AUDIT_LOG_VIEW reads; the job appends events that name a real sample; nobody changes or deletes one ---------
create policy media_training_events_select_audit on nestly.media_training_events
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('AUDIT_LOG_VIEW')));

create policy media_training_events_select_jobs on nestly.media_training_events
  for select to app_media_jobs
  using (true);

create policy media_training_events_insert_jobs on nestly.media_training_events
  for insert to app_media_jobs
  with check (
    (action in ('added', 'accessed') and exists (
      select 1 from nestly.media_training_samples t
      where t.id = media_training_events.sample_id and t.source = media_training_events.source and t.label = media_training_events.label))
    or (action in ('expired', 'removed')
      and not exists (select 1 from nestly.media_training_samples t where t.id = media_training_events.sample_id)
      and exists (select 1 from nestly.media_training_events e
                  where e.sample_id = media_training_events.sample_id and e.action = 'added'
                    and e.source = media_training_events.source and e.label = media_training_events.label)));

-- 4. Grants. Per column: identifiers, owners, clocks, scores, counters, holds and decisions are never written by a client; the job role
-- writes only the columns of its step.
revoke all on table nestly.media_assets, nestly.media_reviews, nestly.profile_photos, nestly.stories, nestly.media_training_candidates,
  nestly.media_training_samples, nestly.media_training_events from public, anon;

grant select (id, kind, status, mime, width, height, byte_size, post_id, position, created_at) on table nestly.media_assets to authenticated;
grant insert (kind, mime, width, height, byte_size) on table nestly.media_assets to authenticated;
grant update (post_id, position, status) on table nestly.media_assets to authenticated;
grant delete on table nestly.media_assets to authenticated;

grant select (media_id, queue_reason, scores, is_child, is_suspected, suspected_at, purge_after, created_at) on table nestly.media_reviews to authenticated;
grant insert (media_id, is_child, is_suspected) on table nestly.media_reviews to authenticated;
grant update (is_child, is_suspected) on table nestly.media_reviews to authenticated;

grant select (user_id, media_id, media_status, updated_at) on table nestly.profile_photos to authenticated;
grant insert (media_id) on table nestly.profile_photos to authenticated;
grant update (media_id) on table nestly.profile_photos to authenticated;
grant delete on table nestly.profile_photos to authenticated;

grant select (id, author_id, media_id, media_status, caption, audience, created_at, expires_at) on table nestly.stories to authenticated;
grant insert (media_id, caption, audience) on table nestly.stories to authenticated;

grant insert (media_id) on table nestly.media_training_candidates to authenticated;

grant select on table nestly.media_training_events to authenticated;

grant usage on schema nestly to app_media_jobs;
grant select (id, kind, status, mime, width, height, byte_size, post_id, is_held, check_attempts, decided_at, is_file_removed, created_at)
  on table nestly.media_assets to app_media_jobs;
grant update (status, check_attempts, is_file_removed) on table nestly.media_assets to app_media_jobs;
grant delete on table nestly.media_assets to app_media_jobs;
grant select (media_id, queue_reason, is_child, is_suspected, purge_after) on table nestly.media_reviews to app_media_jobs;
grant insert (media_id, queue_reason, scores) on table nestly.media_reviews to app_media_jobs;
grant select (media_id) on table nestly.profile_photos to app_media_jobs;
grant select (id, media_id, expires_at) on table nestly.stories to app_media_jobs;
grant delete on table nestly.stories to app_media_jobs;
grant select (media_id) on table nestly.media_training_candidates to app_media_jobs;
grant select (id, source_media_id, label, source, is_child, mime, decided_at, created_at, expires_at) on table nestly.media_training_samples to app_media_jobs;
grant insert (source_media_id, label, source, is_child, mime, decided_at) on table nestly.media_training_samples to app_media_jobs;
grant delete on table nestly.media_training_samples to app_media_jobs;
grant select (sample_id, action, source, label) on table nestly.media_training_events to app_media_jobs;
grant insert (sample_id, action, purpose, source, label) on table nestly.media_training_events to app_media_jobs;

-- 5. The Audit Log: audit_trigger() gains the media branches (rule 18); the rest is the text of 20261021300000, unchanged.
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
  elsif tg_table_name = 'recovery_lock_releases' then
    v_key := 'RECOVERY_LOCK_RELEASE';
    v_action := 'recovery_lock_released';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := nullif(v_new ->> 'reason', '');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_suspected';
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after');
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a recovery lock release, a staff decision on an image or a suspicion marked on one: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

create trigger media_assets_decision_audit
  after update of status on nestly.media_assets
  for each row
  when (old.status in ('queued', 'passed', 'approved') and new.status in ('approved', 'rejected') and old.status is distinct from new.status)
  execute function nestly.audit_trigger();

create trigger media_reviews_suspicion_audit_insert
  after insert on nestly.media_reviews
  for each row when (new.is_suspected)
  execute function nestly.audit_trigger();

create trigger media_reviews_suspicion_audit_update
  after update of is_suspected on nestly.media_reviews
  for each row when (new.is_suspected and not old.is_suspected)
  execute function nestly.audit_trigger();

-- 6. Comments.
comment on table nestly.media_assets is 'FR-FEED-002, FR-PROFILE-001, FR-FEED-008, NFR-MEDIA-001: one row per uploaded image (the file is in private storage under the row''s id). pending until the check; passed, or queued for staff; queued then approved or rejected. The uploader sees pending, passed, queued ("ממתין לבדיקה"), approved and rejected; others only passed or approved, through a post, profile photo or Story they can read.';
comment on column nestly.media_assets.id is 'The image; also its file name in the media bucket.';
comment on column nestly.media_assets.owner_id is 'The uploader (default auth.uid()). Never granted to a client: an anonymous post''s image must not name its author. NULL once the account is deleted (a held image stays its 90 days).';
comment on column nestly.media_assets.owner_status is 'Copy of the uploader''s users.status (composite FK, ON UPDATE CASCADE): a suspended uploader''s images are hidden. Never granted.';
comment on column nestly.media_assets.kind is 'post, profile or story.';
comment on column nestly.media_assets.status is 'pending (only the uploader sees it) · passed · queued (blocked, unsure or the check kept failing) · approved · rejected (by staff; a suspicion is a rejection too, told apart only by is_held, which no client reads).';
comment on column nestly.media_assets.mime is 'The stored format: the server re-encodes every upload (no EXIF or GPS).';
comment on column nestly.media_assets.width is 'Pixels, at most 2,048 (VAL-041, AC-104).';
comment on column nestly.media_assets.height is 'Pixels, at most 2,048.';
comment on column nestly.media_assets.byte_size is 'Size of the stored file, at most 5 MB.';
comment on column nestly.media_assets.post_id is 'The post, set once by the uploader; NULL for a profile photo, a Story image or an image not attached yet. Set NULL when the post row goes (the purge then removes the image).';
comment on column nestly.media_assets.position is 'Order in the post, 0 to 3: at most 4 images per post (VAL-041), by the unique (post_id, position).';
comment on column nestly.media_assets.is_held is 'Rejected as a suspicion of child abuse (M6): kept 90 days from the suspicion, never purged early, never deleted by the uploader, never in the training set. Set only by the decision guard; never granted to a client.';
comment on column nestly.media_assets.check_attempts is 'Failed checks so far; at the limit the job queues the image (fail closed). Never granted to a client.';
comment on column nestly.media_assets.checked_at is 'When the check moved the image (set by the guard). Never granted to a client.';
comment on column nestly.media_assets.decided_by is 'The staff member who decided (set by the guard; NULL once that account is gone). Never granted to a client.';
comment on column nestly.media_assets.decided_at is 'When staff decided (set by the guard). Never granted to a client.';
comment on column nestly.media_assets.is_file_removed is 'The rejected image''s file was deleted (Afik 20.10.2026: at once, after the training copy where one is made); the row stays so the uploader sees the rejection.';
comment on column nestly.media_assets.created_at is 'Upload time.';
comment on table nestly.media_reviews is 'Staff only (CONTENT_MODERATE): why an image was queued and the model''s scores, the "יש בתמונה ילד" mark, and a suspicion of child abuse (M6). Nothing here reaches the uploader.';
comment on column nestly.media_reviews.media_id is 'The image.';
comment on column nestly.media_reviews.queue_reason is 'blocked (a covered part exposed above the block threshold), unsure (between the thresholds) or error (the check kept failing); written once by the job. NULL for a suspicion on an image that had passed.';
comment on column nestly.media_reviews.scores is 'The model''s highest score per label it checks, for the queue. Written by the job only.';
comment on column nestly.media_reviews.is_child is 'Marked by staff: "a child is in the image". Metadata, copied to a training sample; it does not exclude the image (Afik 20.10.2026).';
comment on column nestly.media_reviews.is_suspected is 'A suspicion of child abuse (M6). Never withdrawn; the image is rejected and held.';
comment on column nestly.media_reviews.suspected_by is 'Who marked the suspicion (set by the guard; NULL once that account is gone). Not granted.';
comment on column nestly.media_reviews.suspected_at is 'When (set by the guard).';
comment on column nestly.media_reviews.purge_after is 'suspected_at + 90 days (set by the guard): then the job deletes the image (M6).';
comment on column nestly.media_reviews.created_at is 'When the review row was written.';
comment on table nestly.profile_photos is 'FR-PROFILE-001: the current photo of a Regular or Professional account; replacing it deletes the previous image row at once (BR-077) unless it is queued or rejected. The owner reads it in any state; others once the image passed or was approved.';
comment on column nestly.profile_photos.user_id is 'The account (default auth.uid()).';
comment on column nestly.profile_photos.user_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.profile_photos.media_id is 'The current image: kind profile, the caller''s own (profile_photos_media_owner_fkey).';
comment on column nestly.profile_photos.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): the policy''s "has it passed". Set by the trigger.';
comment on column nestly.profile_photos.updated_at is 'When the photo was set.';
comment on table nestly.stories is 'FR-FEED-008: a Story, one image and optional text for 24 hours; at most 10 per author in 24 hours, counted on Story rows (stories_prepare, VAL-042, ERR-040). Regular accounts only, never anonymous. The author sees it at once, the audience after the image passed or was approved. Deleting the image leaves the row (no image) until it expires, so it still counts.';
comment on column nestly.stories.id is 'The Story.';
comment on column nestly.stories.author_id is 'The author (a Regular profile; default auth.uid()).';
comment on column nestly.stories.author_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.stories.media_id is 'The Story''s image (kind story, the author''s own by stories_media_owner_fkey, uploaded within the hour); NULL once the image is deleted.';
comment on column nestly.stories.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): others see the Story only after the image passed or was approved.';
comment on column nestly.stories.caption is 'Optional text, 1 to 200 characters (VAL-042, Afik 20.10.2026).';
comment on column nestly.stories.audience is 'everyone or friends (OP-033).';
comment on column nestly.stories.created_at is 'Set by the trigger to the transaction time.';
comment on column nestly.stories.expires_at is 'created_at + 24 hours (set by the trigger): the policy hides the Story from then on and the job deletes it.';
comment on table nestly.media_training_candidates is 'Afik 20.10.2026: images removed after a handled report (action taken) that is not a child-safety report: the post removed, or the image rejected from passed. Model misses the job may copy to the training set. Written in the moderator''s transaction by media_training_candidate(); never a suspected image.';
comment on column nestly.media_training_candidates.media_id is 'The image.';
comment on column nestly.media_training_candidates.created_at is 'When it became a candidate.';
comment on table nestly.media_training_samples is 'Afik 20.10.2026: the index of the training set, used only to train the safety model: images the model blocked or was unsure about (children included) with the staff decision, and images removed after a report. Files in a separate private bucket only the job reaches; every access is in media_training_events. Never a suspected image (one that becomes suspected is removed); no client reads it; kept exactly 6 months.';
comment on column nestly.media_training_samples.id is 'The sample; also its file name in the training bucket.';
comment on column nestly.media_training_samples.source_media_id is 'The image it was copied from (no foreign key: the sample outlives the image row).';
comment on column nestly.media_training_samples.label is 'blocked (staff rejected it, or it was removed after a report) or allowed (staff approved it).';
comment on column nestly.media_training_samples.source is 'blocked or unsure (the model''s verdict), or reported (it passed and was removed after a report).';
comment on column nestly.media_training_samples.is_child is 'Copy of the "a child is in the image" mark (metadata; it does not exclude the image).';
comment on column nestly.media_training_samples.mime is 'Format of the file.';
comment on column nestly.media_training_samples.decided_at is 'When staff decided (copied from the image); NULL for a reported sample.';
comment on column nestly.media_training_samples.created_at is 'When the job copied it.';
comment on column nestly.media_training_samples.expires_at is 'created_at + 6 months exactly (CHECK; not writable): then the job deletes the sample and its file.';
comment on table nestly.media_training_events is 'The access record of the training set (Afik 20.10.2026): added, expired and removed by trigger in the same transaction, accessed by the job (with its purpose) before it reads a file. Each event names a real sample. AUDIT_LOG_VIEW reads it; nobody changes or deletes it.';
comment on column nestly.media_training_events.id is 'The event.';
comment on column nestly.media_training_events.sample_id is 'The sample (no foreign key: the record outlives it).';
comment on column nestly.media_training_events.action is 'added, expired (after 6 months), removed (its image became suspected) or accessed.';
comment on column nestly.media_training_events.purpose is 'Why the file was read (accessed only): training.';
comment on column nestly.media_training_events.source is 'The sample''s source.';
comment on column nestly.media_training_events.label is 'The sample''s label.';
comment on column nestly.media_training_events.occurred_at is 'When.';
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the job moves a pending image to passed or queued (a queued one has its reason first) and records a rejected image''s removed file; staff with CONTENT_MODERATE decide a queued image, or reject a checked one with REPORTS_VIEW after a report or as a suspicion (who, when and the hold set here); the uploader attaches an unattached post image to a post of their own.';
comment on function nestly.media_reviews_guard() is 'SECURITY INVOKER. The job writes the queue reason and scores once; staff mark a child or a suspicion (who, when and purge_after = +90 days set here); a suspicion is never withdrawn.';
comment on function nestly.profile_photos_prepare() is 'SECURITY INVOKER. The image must be a profile image the caller can read and not rejected (that it is the caller''s own is the foreign key''s check); copies its status.';
comment on function nestly.profile_photos_replaced() is 'SECURITY INVOKER. A replaced profile photo''s image row is deleted at once (BR-077), under the owner''s delete policy (never a queued or rejected image).';
comment on function nestly.stories_prepare() is 'SECURITY INVOKER. At most 10 Stories in 24 hours per author, counted on Story rows under a per-author lock (NS021, ERR-040); the image is a Story image from the last hour, not rejected (42501); sets the clocks.';
comment on function nestly.media_training_candidate() is 'SECURITY INVOKER, in the moderator''s transaction. After a post report is handled with action taken, or a reported post is removed: the post''s images that passed and are now removed become training candidates, unless a report on the post is a child-safety report or the image is suspected.';
comment on function nestly.media_training_samples_log() is 'SECURITY INVOKER. Every sample added or deleted is recorded in media_training_events in the same transaction (expired at its 6 months, otherwise removed).';
comment on trigger media_assets_decision_audit on nestly.media_assets is 'Every staff decision on an image is appended to the Audit Log in the same transaction (rule 18).';
comment on trigger media_reviews_suspicion_audit_insert on nestly.media_reviews is 'A suspicion marked on a checked image is appended to the Audit Log (M6, rule 18).';
comment on trigger media_reviews_suspicion_audit_update on nestly.media_reviews is 'A suspicion marked on an image that already has a review (queued, or approved from the queue) is appended to the Audit Log (M6, rule 18).';
comment on policy media_assets_select_owner on nestly.media_assets is 'The uploader reads their own images (a Story image for its day), in every state; a suspected image reads exactly as a rejected one.';
comment on policy media_assets_select_viewer on nestly.media_assets is 'Others read an image only after it passed or was approved, through a post, profile photo or Story they can read.';
comment on policy media_assets_select_staff on nestly.media_assets is 'CONTENT_MODERATE reads the queue and the decided images (never the uploader: owner_id is not granted).';
comment on policy media_assets_insert_owner on nestly.media_assets is 'A Regular or Professional uploads, always pending and unattached.';
comment on policy media_assets_update_owner on nestly.media_assets is 'The uploader attaches an unattached post image to their own post (the guard checks the post).';
comment on policy media_assets_update_staff on nestly.media_assets is 'CONTENT_MODERATE decides a queued image; with REPORTS_VIEW too, rejects a checked one (the guard requires a report or a suspicion).';
comment on policy media_assets_delete_owner on nestly.media_assets is 'The uploader removes their own image, never a queued or rejected one (so a held image cannot be told apart, and evidence stays).';
comment on policy media_assets_select_jobs on nestly.media_assets is 'Rule 6 exception: the job reads every image row (the check, the training copy, the purge, the sweep of files with no row).';
comment on policy media_assets_update_jobs on nestly.media_assets is 'Rule 6 exception: the job records the check of a pending image (passed or queued, or one more failed attempt).';
comment on policy media_assets_update_jobs_file on nestly.media_assets is 'Rule 6 exception: the job records that a rejected, not held image''s file is gone, once its training copy exists where one is made (a blocked, unsure or reported image).';
comment on policy media_assets_delete_jobs on nestly.media_assets is 'Rule 6 exception (BR-077, M6): a held image 90 days after the suspicion; otherwise never a queued or held image, and a rejected one only after its file is gone: an expired Story''s image, a rejected image 30 days after the decision, a post image never attached within a day, a profile image that is no one''s photo after a day.';
comment on policy media_reviews_select_staff on nestly.media_reviews is 'CONTENT_MODERATE reads why an image was queued, the scores and the marks.';
comment on policy media_reviews_update_staff on nestly.media_reviews is 'CONTENT_MODERATE marks a child or a suspicion on a queued image; with REPORTS_VIEW too, a suspicion on an approved one (its review exists from the queue).';
comment on policy media_reviews_insert_staff on nestly.media_reviews is 'CONTENT_MODERATE with REPORTS_VIEW marks a suspicion on an image that had passed or was approved.';
comment on policy media_reviews_select_jobs on nestly.media_reviews is 'Rule 6 exception: the job reads the reason, the child mark, the suspicion and its purge time.';
comment on policy media_reviews_insert_jobs on nestly.media_reviews is 'Rule 6 exception: the job writes the queue reason and scores of a pending image, before it queues it.';
comment on policy profile_photos_select_viewer on nestly.profile_photos is 'The owner reads their photo in any state; anyone active once its image passed or was approved (the Basic Public Profile).';
comment on policy profile_photos_insert_owner on nestly.profile_photos is 'A Regular or Professional sets their photo.';
comment on policy profile_photos_update_owner on nestly.profile_photos is 'The owner replaces their photo.';
comment on policy profile_photos_delete_owner on nestly.profile_photos is 'The owner removes their photo.';
comment on policy profile_photos_select_jobs on nestly.profile_photos is 'Rule 6 exception: the purge keeps current photos.';
comment on policy stories_select_viewer on nestly.stories is 'Unexpired only: the author at once; others after the image passed or was approved, by audience (everyone, or accepted Friends).';
comment on policy stories_insert_author on nestly.stories is 'A Regular publishes a Story with an image.';
comment on policy stories_block_hide on nestly.stories is 'RESTRICTIVE (FR-REL-002): a blocked pair sees neither''s Stories, in either direction; the author and REPORTS_VIEW staff unaffected.';
comment on policy profile_photos_block_hide on nestly.profile_photos is 'RESTRICTIVE (FR-REL-002): a blocked pair sees neither''s profile photo, in either direction; the owner and REPORTS_VIEW staff unaffected.';
comment on policy stories_select_jobs on nestly.stories is 'Rule 6 exception: the purge keeps live Stories'' images.';
comment on policy stories_delete_jobs on nestly.stories is 'Rule 6 exception: the job deletes expired Stories.';
comment on policy media_training_candidates_insert_staff on nestly.media_training_candidates is 'CONTENT_MODERATE with REPORTS_VIEW, in the trigger: an image removed after a handled post report (action taken), never with a child-safety report on the post, never a queued-path or suspected image.';
comment on policy media_training_candidates_select_jobs on nestly.media_training_candidates is 'Rule 6 exception: the job reads the candidates to copy them.';
comment on policy media_training_samples_select_jobs on nestly.media_training_samples is 'Rule 6 exception: only the job reads the training set (no manual viewing, Afik 20.10.2026).';
comment on policy media_training_samples_insert_jobs on nestly.media_training_samples is 'Rule 6 exception: a blocked or unsure image staff decided (children included, the decision as the label), or a candidate (label blocked); never a held or suspected image.';
comment on policy media_training_samples_delete_jobs on nestly.media_training_samples is 'Rule 6 exception: at 6 months, or at once when its image becomes suspected.';
comment on policy media_training_events_select_audit on nestly.media_training_events is 'AUDIT_LOG_VIEW (the Admin always) reads the access record.';
comment on policy media_training_events_select_jobs on nestly.media_training_events is 'Rule 6 exception: the job''s insert policy checks an earlier added event.';
comment on policy media_training_events_insert_jobs on nestly.media_training_events is 'Rule 6 exception: an event names a real sample: added or accessed while it exists (same source and label), expired or removed once it is gone and was added.';
