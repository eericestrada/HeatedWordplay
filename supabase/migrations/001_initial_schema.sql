-- ============================================================
-- Heated Wordplay — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- Users (extends Supabase auth.users)
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Groups
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Group members (many-to-many: users <-> groups)
create table public.group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- Puzzles (owned by creator, not by a group)
create table public.puzzles (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.users(id) on delete cascade,
  word            text not null,
  definition      text not null,
  part_of_speech  text not null,
  clue            text check (char_length(clue) <= 100),
  inspo           text not null check (char_length(inspo) <= 200),
  complexity      int not null,
  is_public       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Puzzle shares (distribution: to groups or individual users)
create table public.puzzle_shares (
  id            uuid primary key default gen_random_uuid(),
  puzzle_id     uuid not null references public.puzzles(id) on delete cascade,
  share_type    text not null check (share_type in ('group', 'user')),
  target_id     uuid not null,  -- group_id or user_id depending on share_type
  shared_by     uuid not null references public.users(id) on delete cascade,
  allow_reshare boolean not null default false,
  shared_at     timestamptz not null default now()
);

-- Attempts (game results)
create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  puzzle_id       uuid not null references public.puzzles(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  guesses         jsonb not null default '[]',
  total_guesses   int not null,
  medal           text check (medal in ('gold', 'silver', 'bronze')),
  score           int not null default 0,
  used_clue       boolean not null default false,
  magnets_used    int not null default 0 check (magnets_used between 0 and 2),
  is_own_puzzle   boolean not null default false,
  completed_at    timestamptz not null default now(),
  unique (puzzle_id, user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_group_members_user    on public.group_members(user_id);
create index idx_group_members_group   on public.group_members(group_id);
create index idx_puzzles_creator       on public.puzzles(creator_id);
create index idx_puzzles_public        on public.puzzles(is_public) where is_public = true;
create index idx_puzzle_shares_puzzle  on public.puzzle_shares(puzzle_id);
create index idx_puzzle_shares_target  on public.puzzle_shares(target_id);
create index idx_attempts_puzzle       on public.attempts(puzzle_id);
create index idx_attempts_user         on public.attempts(user_id);
create index idx_attempts_completed    on public.attempts(completed_at desc);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if a user can see a puzzle:
--   1. They created it
--   2. It's public
--   3. It's shared directly to them
--   4. It's shared to a group they belong to
create or replace function public.user_can_see_puzzle(p_user_id uuid, p_puzzle_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.puzzles
    where id = p_puzzle_id
      and (
        creator_id = p_user_id
        or is_public = true
        or exists (
          select 1 from public.puzzle_shares
          where puzzle_id = p_puzzle_id
            and share_type = 'user'
            and target_id = p_user_id
        )
        or exists (
          select 1 from public.puzzle_shares ps
          join public.group_members gm on gm.group_id = ps.target_id
          where ps.puzzle_id = p_puzzle_id
            and ps.share_type = 'group'
            and gm.user_id = p_user_id
        )
      )
  );
$$;

-- Check if a user can reshare a puzzle:
--   1. They created it (always can reshare)
--   2. They received it via a share with allow_reshare = true
create or replace function public.user_can_reshare_puzzle(p_user_id uuid, p_puzzle_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    -- Creator can always reshare
    select 1 from public.puzzles
    where id = p_puzzle_id and creator_id = p_user_id
  )
  or exists (
    -- Direct share with reshare permission
    select 1 from public.puzzle_shares
    where puzzle_id = p_puzzle_id
      and share_type = 'user'
      and target_id = p_user_id
      and allow_reshare = true
  )
  or exists (
    -- Group share with reshare permission (user is member of that group)
    select 1 from public.puzzle_shares ps
    join public.group_members gm on gm.group_id = ps.target_id
    where ps.puzzle_id = p_puzzle_id
      and ps.share_type = 'group'
      and gm.user_id = p_user_id
      and ps.allow_reshare = true
  );
$$;

-- Auto-create user profile when auth.users row is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Trigger: auto-create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-add group creator as a member
create or replace function public.handle_group_created()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.group_members (group_id, user_id)
  values (new.id, new.created_by);
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_group_created();
