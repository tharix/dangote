-- Apply this migration in the Supabase SQL editor.
-- The frontend should use the anon key only; RLS is the security boundary.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.projects enable row level security;

drop policy if exists "Users can read their projects" on public.projects;
create policy "Users can read their projects"
  on public.projects for select
  using (auth.uid() = owner_id);

drop policy if exists "Users can create their projects" on public.projects;
create policy "Users can create their projects"
  on public.projects for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Users can update their projects"
  on public.projects for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Users can delete their projects"
  on public.projects for delete
  using (auth.uid() = owner_id);

create or replace function public.touch_projects_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
before update on public.projects
for each row execute function public.touch_projects_updated_at();

-- Account and cohort workflow. Roles are provisioned by a trusted operator;
-- users cannot grant themselves instructor or administrator privileges.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  role text not null default 'student'
    check (role in ('student', 'instructor', 'administrator')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.create_academy_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists academy_profile_after_signup on auth.users;
create trigger academy_profile_after_signup
after insert on auth.users
for each row execute function public.create_academy_profile();

insert into public.profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (user_id) do nothing;

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.cohort_members (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  member_role text not null check (member_role in ('student', 'instructor')),
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

create table if not exists public.cohort_invites (
  cohort_id uuid primary key references public.cohorts(id) on delete cascade,
  invite_code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists cohort_members_user_role_idx
  on public.cohort_members (user_id, member_role);

alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.cohort_invites enable row level security;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_cohort_member(target_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cohort_members
    where cohort_id = target_cohort and user_id = auth.uid()
  );
$$;

create or replace function private.is_cohort_instructor(target_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cohort_members
    where cohort_id = target_cohort
      and user_id = auth.uid()
      and member_role = 'instructor'
  );
$$;

create or replace function private.is_academy_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role in ('instructor', 'administrator')
  );
$$;

create or replace function private.can_view_academy_profile(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user = auth.uid() or exists (
    select 1
    from public.cohort_members learner
    join public.cohort_members instructor
      on instructor.cohort_id = learner.cohort_id
    where learner.user_id = target_user
      and instructor.user_id = auth.uid()
      and instructor.member_role = 'instructor'
  );
$$;

revoke all on function private.is_cohort_member(uuid) from public;
revoke all on function private.is_cohort_instructor(uuid) from public;
revoke all on function private.is_academy_staff() from public;
revoke all on function private.can_view_academy_profile(uuid) from public;
revoke all on function public.create_academy_profile() from public;
grant execute on function private.is_cohort_member(uuid) to authenticated;
grant execute on function private.is_cohort_instructor(uuid) to authenticated;
grant execute on function private.is_academy_staff() to authenticated;
grant execute on function private.can_view_academy_profile(uuid) to authenticated;

drop policy if exists "Users can read their projects" on public.projects;
drop policy if exists "Users can create their projects" on public.projects;
drop policy if exists "Users can update their projects" on public.projects;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can read permitted profiles" on public.profiles;
drop policy if exists "Users can update own display name" on public.profiles;
drop policy if exists "Members can read their cohorts" on public.cohorts;
drop policy if exists "Staff can create cohorts" on public.cohorts;
drop policy if exists "Members can read cohort membership" on public.cohort_members;
drop policy if exists "Instructors can read cohort invite codes" on public.cohort_invites;
drop policy if exists "Students can create their own projects" on public.projects;
drop policy if exists "Owners and cohort instructors can update projects" on public.projects;

create policy "Users can read permitted profiles"
  on public.profiles for select to authenticated
  using (private.can_view_academy_profile(user_id));
create policy "Users can update own display name"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Members can read their cohorts"
  on public.cohorts for select to authenticated
  using (private.is_cohort_member(id));
create policy "Staff can create cohorts"
  on public.cohorts for insert to authenticated
  with check (created_by = auth.uid() and private.is_academy_staff());

create policy "Members can read cohort membership"
  on public.cohort_members for select to authenticated
  using (user_id = auth.uid() or private.is_cohort_instructor(cohort_id));
create policy "Instructors can read cohort invite codes"
  on public.cohort_invites for select to authenticated
  using (private.is_cohort_instructor(cohort_id));

revoke all on public.cohorts, public.cohort_members, public.cohort_invites from anon, authenticated;
grant select, insert on public.cohorts to authenticated;
grant select on public.cohort_members, public.cohort_invites to authenticated;

create or replace function public.create_academy_cohort(cohort_name text)
returns table (cohort_id uuid, name text, invite_code uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_cohort_id uuid;
  new_invite_code uuid;
begin
  if not private.is_academy_staff() then
    raise exception 'Only an assigned instructor can create a cohort.';
  end if;
  if cohort_name is null or char_length(trim(cohort_name)) not between 1 and 100 then
    raise exception 'Cohort name must contain 1 to 100 characters.';
  end if;

  insert into public.cohorts (name, created_by)
  values (trim(cohort_name), auth.uid())
  returning id into new_cohort_id;
  insert into public.cohort_members (cohort_id, user_id, member_role)
  values (new_cohort_id, auth.uid(), 'instructor');
  insert into public.cohort_invites (cohort_id)
  values (new_cohort_id)
  returning cohort_invites.invite_code into new_invite_code;
  return query select new_cohort_id, trim(cohort_name), new_invite_code;
end;
$$;

create or replace function public.join_academy_cohort(invite_code uuid)
returns table (cohort_id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_cohort uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'student'
  ) then
    raise exception 'Only an assigned student can join a cohort.';
  end if;

  select invites.cohort_id into matched_cohort
  from public.cohort_invites invites
  where invites.invite_code = join_academy_cohort.invite_code;
  if matched_cohort is null then
    raise exception 'Cohort invite code is invalid.';
  end if;

  insert into public.cohort_members (cohort_id, user_id, member_role)
  values (matched_cohort, auth.uid(), 'student')
  on conflict (cohort_id, user_id) do nothing;
  return query select cohorts.id, cohorts.name
  from public.cohorts
  where cohorts.id = matched_cohort;
end;
$$;

revoke all on function public.create_academy_cohort(text) from public;
revoke all on function public.join_academy_cohort(uuid) from public;
grant execute on function public.create_academy_cohort(text) to authenticated;
grant execute on function public.join_academy_cohort(uuid) to authenticated;

alter table public.projects
  add column if not exists workspace jsonb not null default '{}'::jsonb,
  add column if not exists cohort_id uuid references public.cohorts(id),
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'submitted', 'changes-requested', 'approved')),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewer_id uuid references public.profiles(user_id),
  add column if not exists review_comment text not null default ''
    check (char_length(review_comment) <= 500),
  add column if not exists review_history jsonb not null default '[]'::jsonb;

create index if not exists projects_cohort_status_updated_idx
  on public.projects (cohort_id, status, updated_at desc);

drop policy if exists "Authenticated owners and cohort instructors can read projects" on public.projects;
drop policy if exists "Students can create their own projects" on public.projects;
drop policy if exists "Owners and cohort instructors can update projects" on public.projects;

create policy "Authenticated owners and cohort instructors can read projects"
  on public.projects for select to authenticated
  using (auth.uid() = owner_id or private.is_cohort_instructor(cohort_id));
create policy "Students can create their own projects"
  on public.projects for insert to authenticated
  with check (
    auth.uid() = owner_id
    and status = 'draft'
    and reviewer_id is null
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role = 'student'
    )
  );
create policy "Owners and cohort instructors can update projects"
  on public.projects for update to authenticated
  using (auth.uid() = owner_id or private.is_cohort_instructor(cohort_id))
  with check (auth.uid() = owner_id or private.is_cohort_instructor(cohort_id));

revoke all on public.projects from anon, authenticated;
grant select, insert, update on public.projects to authenticated;

create or replace function public.guard_project_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id <> auth.uid() or new.status <> 'draft'
      or new.reviewer_id is not null or new.review_history <> '[]'::jsonb
      or new.submitted_at is not null
      or (new.cohort_id is not null and not exists (
        select 1 from public.cohort_members
        where cohort_id = new.cohort_id and user_id = auth.uid() and member_role = 'student'
      )) then
      raise exception 'Projects must be created by their owner as drafts.';
    end if;
    return new;
  end if;

  if old.owner_id = auth.uid() and not private.is_cohort_instructor(old.cohort_id) then
    if new.owner_id is distinct from old.owner_id
      or new.cohort_id is distinct from old.cohort_id
      or new.reviewer_id is distinct from old.reviewer_id
      or new.review_comment is distinct from old.review_comment
      or new.review_history is distinct from old.review_history
      or new.created_at is distinct from old.created_at
      or new.submitted_at is distinct from old.submitted_at
      or new.status not in ('draft', 'submitted')
      or old.status = 'approved'
      or (old.status = 'changes-requested' and new.status not in ('draft', 'submitted')) then
      raise exception 'Student update is not permitted for this project state.';
    end if;
    if new.status = 'submitted' and (
      new.cohort_id is null or not exists (
        select 1 from public.cohort_members
        where cohort_id = new.cohort_id and user_id = auth.uid() and member_role = 'student'
      )
    ) then
      raise exception 'Join a cohort before submitting this project.';
    end if;
    if old.status = 'submitted' and new.status = 'submitted'
      and (new.name is distinct from old.name or new.rows is distinct from old.rows
        or new.workspace is distinct from old.workspace) then
      new.status = 'draft';
      new.submitted_at = null;
    end if;
    if new.status = 'submitted' then
      new.submitted_at = now();
      new.review_history = old.review_history || jsonb_build_array(jsonb_build_object(
        'action', case
          when old.review_history -> -1 ->> 'action' = 'Requested changes' then 'Resubmitted'
          else 'Submitted'
        end,
        'actor_id', auth.uid(),
        'at', now()
      ));
    end if;
    return new;
  end if;

  if private.is_cohort_instructor(old.cohort_id)
    and old.owner_id <> auth.uid()
    and old.status = 'submitted'
    and new.status in ('approved', 'changes-requested')
    and new.owner_id = old.owner_id
    and new.cohort_id = old.cohort_id
    and new.name = old.name
    and new.rows = old.rows
    and new.workspace = old.workspace
    and new.created_at = old.created_at
    and new.submitted_at = old.submitted_at then
    new.reviewer_id = auth.uid();
    new.review_history = old.review_history || jsonb_build_array(jsonb_build_object(
      'action', case when new.status = 'approved' then 'Approved' else 'Requested changes' end,
      'actor_id', auth.uid(),
      'at', now(),
      'comment', new.review_comment
    ));
    return new;
  end if;

  raise exception 'Only an assigned instructor can review a submitted cohort project.';
end;
$$;

revoke all on function public.guard_project_workflow() from public;
drop trigger if exists projects_guard_workflow on public.projects;
create trigger projects_guard_workflow
before insert or update on public.projects
for each row execute function public.guard_project_workflow();
