-- Students can read their own meeting rows: the book stays the teacher's to
-- write, but the student gets the same table read-only, link included, so
-- "which meeting are we on and is it settled" is not a question they have to
-- ask over chat.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- SELECT only, and only their own rows. Writing stays behind 002's teacher
-- policy; a student can never log, edit or delete a meeting.

drop policy if exists "students read their own meetings" on public.meetings;
create policy "students read their own meetings"
  on public.meetings for select
  using (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop policy if exists "students read their own meetings" on public.meetings;
