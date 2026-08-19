-- Classroom: a teacher creates a class, students join with a code, and the
-- teacher can see how far each of them has got.
--
-- APPLIED 2026-08-20 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- This is the first change that lets one account read another account's data,
-- and the whole security of it rests on the policies below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 80),
  -- Short, unambiguous, and typed by a student off a projector: no O/0 or I/1.
  join_code  text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists classes_teacher_idx on public.classes (teacher_id);

create table if not exists public.class_members (
  class_id   uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  -- Supplied by the student when they join. The alternative was exposing
  -- auth.users through the view so the teacher could read an email, which is
  -- both more data than a register needs and not the student's to control.
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  joined_at  timestamptz not null default now(),
  primary key (class_id, student_id)
);

create index if not exists class_members_student_idx on public.class_members (student_id);

alter table public.classes       enable row level security;
alter table public.class_members enable row level security;

-- ---------------------------------------------------------------------------
-- Policies: classes
-- ---------------------------------------------------------------------------
-- A teacher owns their classes outright. Students deliberately get NO direct
-- select on this table: being able to read it by join_code would let anyone
-- enumerate every class in the project by guessing codes. They reach their own
-- classes through class_members instead, and join through the function below.

drop policy if exists "teachers manage their own classes" on public.classes;
create policy "teachers manage their own classes"
  on public.classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "students read the classes they are in" on public.classes;
create policy "students read the classes they are in"
  on public.classes for select
  using (
    exists (
      select 1 from public.class_members m
      where m.class_id = classes.id
        and m.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: class_members
-- ---------------------------------------------------------------------------

drop policy if exists "teachers see their own roster" on public.class_members;
create policy "teachers see their own roster"
  on public.class_members for select
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_members.class_id
        and c.teacher_id = auth.uid()
    )
  );

-- A teacher can remove a student; a student can remove themselves. Nobody else.
drop policy if exists "teachers remove students" on public.class_members;
create policy "teachers remove students"
  on public.class_members for delete
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_members.class_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists "students see and leave their own membership" on public.class_members;
create policy "students see and leave their own membership"
  on public.class_members for select
  using (student_id = auth.uid());

drop policy if exists "students leave a class" on public.class_members;
create policy "students leave a class"
  on public.class_members for delete
  using (student_id = auth.uid());

-- No INSERT policy at all: joining goes through join_class() below, so a
-- student can never write themselves into an arbitrary class id.

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
-- security definer because the student cannot select the class they are about
-- to join. The code is looked up here, under a fixed search_path, and the only
-- thing that comes back is the class they successfully joined.

create or replace function public.join_class(code text, display_name text)
returns table (class_id uuid, class_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.classes%rowtype;
  who    text := nullif(trim(display_name), '');
begin
  if auth.uid() is null then
    raise exception 'must be signed in to join a class';
  end if;

  if who is null then
    raise exception 'a name is required to join a class';
  end if;

  select * into target
  from public.classes
  where join_code = upper(trim(code))
    and archived = false;

  if not found then
    raise exception 'no open class with that code';
  end if;

  if target.teacher_id = auth.uid() then
    raise exception 'you are the teacher of that class';
  end if;

  insert into public.class_members (class_id, student_id, display_name)
  values (target.id, auth.uid(), left(who, 40))
  on conflict (class_id, student_id)
    do update set display_name = excluded.display_name;

  return query select target.id, target.name;
end;
$$;

revoke all on function public.join_class(text, text) from public;
grant execute on function public.join_class(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What a teacher may read of a student
-- ---------------------------------------------------------------------------
-- Deliberately a security-definer view rather than a new SELECT policy on
-- `progress`. RLS is row level, not column level: a policy permissive enough to
-- show a teacher a student's stars would also hand them `saved_code`, which is
-- the student's actual writing and none of the teacher's business. The view
-- names the three columns a roster needs and nothing else.

create or replace view public.class_progress
with (security_invoker = false) as
  select
    m.class_id,
    m.student_id,
    m.display_name,
    m.joined_at,
    p.data     as progress,
    p.practice as practice,
    p.updated_at
  from public.class_members m
  join public.classes c on c.id = m.class_id
  left join public.progress p on p.user_id = m.student_id
  where c.teacher_id = auth.uid();

-- `revoke ... from public` is not enough on its own. Supabase's default
-- privileges grant anon and authenticated select on anything created in the
-- public schema, and a role-specific grant survives a revoke from PUBLIC, so
-- anon came out of the create with read access. It returns no rows either way
-- (auth.uid() is null, and no class has a null teacher), but a security-definer
-- view bypasses RLS and should not have its WHERE clause as the only lock.
revoke all on public.class_progress from public;
revoke all on public.class_progress from anon;
grant select on public.class_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop view if exists public.class_progress;
-- drop function if exists public.join_class(text, text);
-- drop table if exists public.class_members;
-- drop table if exists public.classes;
