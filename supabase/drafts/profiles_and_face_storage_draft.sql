-- Draft only. Do not apply to a remote Supabase project without review/approval.
-- Purpose: starting point for PRD items: user profiles and private face image storage.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  sensitivity numeric not null default 1.0,
  total_plays integer not null default 0,
  best_score integer not null default 0,
  best_reaction_ms integer not null default 9999,
  total_kills integer not null default 0,
  best_grade text not null default 'C',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_length check (char_length(nickname) between 1 and 32),
  constraint profiles_best_grade_allowed check (best_grade in ('C', 'B', 'A', 'S', 'S+'))
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Private bucket for user-uploaded face images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-uploads',
  'face-uploads',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention: <auth.uid()>/<file-name>
drop policy if exists "face_uploads_select_own_folder" on storage.objects;
create policy "face_uploads_select_own_folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'face-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "face_uploads_insert_own_folder" on storage.objects;
create policy "face_uploads_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'face-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "face_uploads_update_own_folder" on storage.objects;
create policy "face_uploads_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'face-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'face-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "face_uploads_delete_own_folder" on storage.objects;
create policy "face_uploads_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'face-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

