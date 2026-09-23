begin;

create extension if not exists pgcrypto;
create type public.venue_id as enum ('songrim', 'dream', 'gym', 'online');
create type public.venue_state as enum (
  'preparing', 'open', 'recommended', 'busy', 'full', 'checking'
);
create type public.moment_status as enum ('pending_review', 'approved', 'rejected');

create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  day_key text not null,
  day_label text not null,
  is_active boolean not null default false,
  official_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_app_event
  on public.app_events (is_active)
  where is_active;

create table public.venues (
  id public.venue_id primary key,
  event_id uuid not null references public.app_events (id),
  name text not null,
  state public.venue_state not null default 'preparing',
  description text not null,
  details text,
  updated_at timestamptz not null default now(),
  updated_by text not null default '운영팀'
);

create table public.attendance_checkins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.app_events (id),
  day_key text not null,
  today boolean not null default false,
  tomorrow boolean not null default false,
  selected_venue public.venue_id,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id, event_id, day_key)
);

create table public.attendance_mutation_receipts (
  request_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.app_events (id) on delete cascade,
  day_key text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, auth_user_id, event_id, day_key)
);

create table public.operator_members (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.venue_state_events (
  id uuid primary key default gen_random_uuid(),
  venue_id public.venue_id not null references public.venues (id),
  before_state public.venue_state not null,
  after_state public.venue_state not null,
  request_id uuid not null unique,
  actor_user_id uuid not null references auth.users (id),
  updated_by text not null,
  created_at timestamptz not null default now()
);

create table public.moment_submissions (
  id uuid primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  media_type text not null check (
    media_type in (
      'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'
    )
  ),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  storage_path text not null unique,
  status public.moment_status not null default 'pending_review',
  consent_confirmed boolean not null check (consent_confirmed),
  review_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path like auth_user_id::text || '/%')
);

alter table public.app_events enable row level security;
alter table public.venues enable row level security;
alter table public.attendance_checkins enable row level security;
alter table public.attendance_mutation_receipts enable row level security;
alter table public.operator_members enable row level security;
alter table public.venue_state_events enable row level security;
alter table public.moment_submissions enable row level security;

revoke all on table public.app_events from anon, authenticated;
revoke all on table public.venues from anon, authenticated;
revoke all on table public.attendance_checkins from anon, authenticated;
revoke all on table public.attendance_mutation_receipts from anon, authenticated;
revoke all on table public.operator_members from anon, authenticated;
revoke all on table public.venue_state_events from anon, authenticated;
revoke all on table public.moment_submissions from anon, authenticated;

grant select on table public.app_events to anon, authenticated;
grant select on table public.venues to anon, authenticated;
grant select on table public.attendance_checkins to authenticated;
grant select on table public.venue_state_events to authenticated;
grant select, insert on table public.moment_submissions to authenticated;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.operator_members as member
      where member.auth_user_id = auth.uid()
        and member.active
    );
$$;
revoke all on function public.is_operator() from public, anon, authenticated;
grant execute on function public.is_operator() to authenticated;

create policy active_event_read
  on public.app_events
  for select
  to anon, authenticated
  using (is_active);

create policy active_venues_read
  on public.venues
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.app_events as event
      where event.id = event_id
        and event.is_active
    )
  );

create policy own_attendance_read
  on public.attendance_checkins
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy own_pending_moment_insert
  on public.moment_submissions
  for insert
  to authenticated
  with check (
    auth_user_id = auth.uid()
    and status = 'pending_review'
    and storage_path like auth.uid()::text || '/%'
  );

create policy own_or_operator_moment_read
  on public.moment_submissions
  for select
  to authenticated
  using (auth_user_id = auth.uid() or public.is_operator());

create policy operator_event_log_read
  on public.venue_state_events
  for select
  to authenticated
  using (public.is_operator());

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'venue_state_events are immutable';
end;
$$;
revoke all on function public.prevent_audit_mutation() from public, anon, authenticated;

create trigger venue_state_events_immutable
before update or delete on public.venue_state_events
for each row execute function public.prevent_audit_mutation();


create or replace function public.get_public_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    select event.id, event.day_key, event.official_approved
    from public.app_events as event
    where event.is_active
    limit 1
  ),
  counts as (
    select
      pg_catalog.count(*) filter (where attendance.today) as today_total,
      pg_catalog.count(*) filter (
        where attendance.today
          and attendance.selected_venue is not null
          and attendance.selected_venue <> 'online'::public.venue_id
      ) as onsite_total,
      pg_catalog.count(*) filter (
        where attendance.today
          and attendance.selected_venue = 'online'::public.venue_id
      ) as online_total,
      pg_catalog.count(*) filter (
        where attendance.today and attendance.selected_venue is null
      ) as unselected_total,
      pg_catalog.count(*) filter (where attendance.tomorrow) as tomorrow_total
    from public.attendance_checkins as attendance
    join active as event
      on attendance.event_id = event.id
      and attendance.day_key = event.day_key
  ),
  venue_json as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', venue.id,
          'name', venue.name,
          'state', venue.state,
          'description', venue.description,
          'details', venue.details,
          'updated_at', venue.updated_at,
          'updated_by', venue.updated_by
        ) order by venue.id
      ),
      '[]'::jsonb
    ) as venues
    from public.venues as venue
    join active as event on venue.event_id = event.id
  ),
  mine as (
    select pg_catalog.jsonb_build_object(
      'today', attendance.today,
      'tomorrow', attendance.tomorrow,
      'selected_venue', attendance.selected_venue
    ) as value
    from public.attendance_checkins as attendance
    join active as event
      on attendance.event_id = event.id
      and attendance.day_key = event.day_key
    where auth.uid() is not null
      and attendance.auth_user_id = auth.uid()
  )
  select pg_catalog.jsonb_build_object(
    'event_id', event.id,
    'day_key', event.day_key,
    'official_approved', event.official_approved,
    'today_total', coalesce(counts.today_total, 0),
    'onsite_total', coalesce(counts.onsite_total, 0),
    'online_total', coalesce(counts.online_total, 0),
    'unselected_total', coalesce(counts.unselected_total, 0),
    'tomorrow_total', coalesce(counts.tomorrow_total, 0),
    'venues', venue_json.venues,
    'my_attendance', case
      when auth.uid() is null then null
      else (select mine.value from mine)
    end
  )
  from active as event
  cross join counts
  cross join venue_json;
$$;
revoke all on function public.get_public_snapshot() from public, anon, authenticated;
grant execute on function public.get_public_snapshot() to anon, authenticated;

create or replace function public.set_my_attendance(
  p_event_id uuid,
  p_day_key text,
  p_today boolean,
  p_tomorrow boolean,
  p_selected_venue public.venue_id,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_rows bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_event_id is null or p_day_key is null or p_day_key = ''
    or p_today is null or p_tomorrow is null or p_request_id is null then
    raise exception 'invalid attendance input';
  end if;
  if not exists (
    select 1
    from public.app_events as event
    where event.id = p_event_id
      and event.day_key = p_day_key
      and event.is_active
  ) then
    raise exception 'inactive event';
  end if;

  insert into public.attendance_mutation_receipts (
    request_id,
    auth_user_id,
    event_id,
    day_key
  ) values (
    p_request_id,
    auth.uid(),
    p_event_id,
    p_day_key
  )
  on conflict (request_id, auth_user_id, event_id, day_key) do nothing;
  get diagnostics v_receipt_rows = row_count;

  if v_receipt_rows = 0 then
    return public.get_public_snapshot();
  end if;

  insert into public.attendance_checkins (
    auth_user_id,
    event_id,
    day_key,
    today,
    tomorrow,
    selected_venue
  ) values (
    auth.uid(),
    p_event_id,
    p_day_key,
    p_today,
    p_tomorrow,
    p_selected_venue
  )
  on conflict (auth_user_id, event_id, day_key)
  do update set
    today = excluded.today,
    tomorrow = excluded.tomorrow,
    selected_venue = excluded.selected_venue,
    updated_at = pg_catalog.now();

  return public.get_public_snapshot();
end;
$$;
revoke all on function public.set_my_attendance(
  uuid, text, boolean, boolean, public.venue_id, uuid
) from public, anon, authenticated;
grant execute on function public.set_my_attendance(
  uuid, text, boolean, boolean, public.venue_id, uuid
) to authenticated;

create or replace function public.set_venue_state(
  p_venue_id public.venue_id,
  p_state public.venue_state,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.venue_state;
  v_actor text;
begin
  if not public.is_operator() then
    raise exception 'operator access required';
  end if;
  if p_venue_id is null or p_state is null or p_request_id is null then
    raise exception 'invalid venue state input';
  end if;

  select event.before_state
  into v_before
  from public.venue_state_events as event
  where event.request_id = p_request_id
    and event.actor_user_id = auth.uid();
  if found then
    return (
      select pg_catalog.to_jsonb(event)
      from public.venue_state_events as event
      where event.request_id = p_request_id
        and event.actor_user_id = auth.uid()
    );
  end if;

  select venue.state
  into v_before
  from public.venues as venue
  where venue.id = p_venue_id
  for update;
  if not found then
    raise exception 'unknown venue';
  end if;

  select coalesce(member.display_name, member.email, '운영자')
  into v_actor
  from public.operator_members as member
  where member.auth_user_id = auth.uid()
    and member.active;

  update public.venues as venue
  set
    state = p_state,
    updated_at = pg_catalog.now(),
    updated_by = v_actor
  where venue.id = p_venue_id;

  insert into public.venue_state_events (
    venue_id,
    before_state,
    after_state,
    request_id,
    actor_user_id,
    updated_by
  ) values (
    p_venue_id,
    v_before,
    p_state,
    p_request_id,
    auth.uid(),
    v_actor
  );

  return (
    select pg_catalog.to_jsonb(event)
    from public.venue_state_events as event
    where event.request_id = p_request_id
      and event.actor_user_id = auth.uid()
  );
end;
$$;
revoke all on function public.set_venue_state(
  public.venue_id, public.venue_state, uuid
) from public, anon, authenticated;
grant execute on function public.set_venue_state(
  public.venue_id, public.venue_state, uuid
) to authenticated;

create or replace function public.review_moment(
  p_moment_id uuid,
  p_status public.moment_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception 'operator access required';
  end if;
  if p_moment_id is null or p_status not in ('approved', 'rejected') then
    raise exception 'invalid review input';
  end if;
  if p_note is not null and pg_catalog.length(p_note) > 1000 then
    raise exception 'review note too long';
  end if;

  update public.moment_submissions as moment
  set
    status = p_status,
    review_note = nullif(pg_catalog.btrim(p_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = pg_catalog.now()
  where moment.id = p_moment_id
    and moment.status = 'pending_review';
  if not found then
    raise exception 'pending submission not found';
  end if;
end;
$$;
revoke all on function public.review_moment(
  uuid, public.moment_status, text
) from public, anon, authenticated;
grant execute on function public.review_moment(
  uuid, public.moment_status, text
) to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'moment-submissions',
  'moment-submissions',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy moment_owner_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'moment-submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy moment_owner_remove
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'moment-submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy moment_operator_read
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'moment-submissions' and public.is_operator());

do $realtime$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables as published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = 'venues'
  ) then
    execute 'alter publication supabase_realtime add table public.venues';
  end if;
end;
$realtime$;

insert into public.app_events (
  slug, day_key, day_label, is_active, official_approved
) values ('pilot', 'pilot-day', '운영 리허설', true, false);

insert into public.venues (
  id, event_id, name, state, description, details, updated_by
)
select
  seed.id::public.venue_id,
  event.id,
  seed.name,
  'preparing',
  seed.description,
  seed.details,
  '운영 리허설'
from public.app_events as event
cross join (
  values
    ('songrim', '송림 본당', '담당자가 상태를 확인하고 있습니다.', '현장 동선을 확인해 주세요.'),
    ('dream', '드림센터', '담당자가 상태를 확인하고 있습니다.', '아이 동반 동선을 확인해 주세요.'),
    ('gym', '체육관', '담당자가 상태를 확인하고 있습니다.', '주차와 이동 동선을 확인해 주세요.'),
    ('online', '온라인 예배', '온라인 예배 준비 상태를 확인하고 있습니다.', '현장과 같은 예배 참여로 집계됩니다.')
) as seed (id, name, description, details)
where event.slug = 'pilot';

commit;
