-- The teacher's logbook: the meeting link for a class, and one row per meeting
-- held, carrying its number, its date and where payment stands.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- Numbers are explicit rather than counted, because the teacher's history
-- predates the app: their next meeting might be number 12, and the app's first
-- row should be free to say so. After that the UI offers max + 1.

alter table public.classes
  add column if not exists meet_link text
  check (meet_link is null or char_length(meet_link) <= 500);

create table if not exists public.meetings (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  num        integer not null check (num between 1 and 9999),
  met_on     date not null default current_date,
  -- Where payment stands for this meeting, from the teacher's side of the
  -- conversation: not asked yet, asked, settled.
  payment    text not null default 'unpaid' check (payment in ('unpaid', 'asked', 'paid')),
  note       text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (class_id, num)
);

create index if not exists meetings_class_idx on public.meetings (class_id);

alter table public.meetings enable row level security;

-- Teacher-only, deliberately with no student policy at all: payment status is
-- between the teacher and their book, and a student being able to read it
-- would be worse than the feature not existing. is_teacher_of is the
-- security-definer helper 001 created.
drop policy if exists "teachers manage their meetings" on public.meetings;
create policy "teachers manage their meetings"
  on public.meetings for all
  using (public.is_teacher_of(class_id))
  with check (public.is_teacher_of(class_id));

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop table if exists public.meetings;
-- alter table public.classes drop column if exists meet_link;
