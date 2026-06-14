-- Draft only. Do not apply to a remote database without explicit user approval.
-- Purpose: optional Supabase-native profile/score storage if the app is migrated away from Redis score storage.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  nickname text not null check (char_length(nickname) between 1 and 16),
  mode text not null check (mode in ('grid', 'triple', 'tracking', 'fps-grid', 'fps-triple', 'fps-tracking')),
  score integer not null check (score >= 0),
  kills integer not null default 0 check (kills >= 0),
  duration_sec integer not null check (duration_sec in (30, 60)),
  reaction_ms integer not null default 0 check (reaction_ms between 0 and 9999),
  accuracy integer not null default 0 check (accuracy between 0 and 100),
  max_combo integer not null default 0 check (max_combo >= 0),
  grade text not null default 'C' check (grade in ('C', 'B', 'A', 'S', 'S+')),
  kpm integer not null default 0 check (kpm >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "scores_select_public" on public.scores
  for select using (true);

create policy "scores_insert_own" on public.scores
  for insert with check (auth.uid() = user_id);

create index if not exists scores_mode_score_idx on public.scores (mode, score desc);
create index if not exists scores_user_created_idx on public.scores (user_id, created_at desc);
