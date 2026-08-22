-- Profile photos: one public storage bucket, each account writing only inside
-- its own folder (avatars/<uid>/...). Public read, because an avatar is shown
-- to classmates and teachers and a signed URL per render would be silly.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- The name and the photo URL themselves live in auth.users.user_metadata
-- (written by auth.updateUser from the client); this file is only the bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars are public to read" on storage.objects;
create policy "avatars are public to read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- The first path segment is the owner's uid; auth.uid() must match it to write.
drop policy if exists "accounts write their own avatar" on storage.objects;
create policy "accounts write their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "accounts replace their own avatar" on storage.objects;
create policy "accounts replace their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "accounts remove their own avatar" on storage.objects;
create policy "accounts remove their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop policy if exists "accounts remove their own avatar" on storage.objects;
-- drop policy if exists "accounts replace their own avatar" on storage.objects;
-- drop policy if exists "accounts write their own avatar" on storage.objects;
-- drop policy if exists "avatars are public to read" on storage.objects;
-- delete from storage.objects where bucket_id = 'avatars';
-- delete from storage.buckets where id = 'avatars';
