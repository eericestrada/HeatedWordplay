-- ============================================================
-- Heated Wordplay — Submission Log
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================
--
-- Logs every word submission a player makes on a friendly puzzle,
-- including the ones rejected by the dictionary as invalid words.
-- This is independent of the `attempts` table (which only gets a row
-- when a game is *completed*), so abandoned puzzles still keep a record
-- of how many invalid words a player tried before giving up.
--
-- Counting is best-effort / client-side — not tamper-proof. Fine for a
-- friends-only game; the goal is fun stats, not anti-cheat.
-- ============================================================

create table public.submissions (
  id         uuid primary key default gen_random_uuid(),
  puzzle_id  uuid not null references public.puzzles(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  is_valid   boolean not null,        -- passed the dictionary check or not
  created_at timestamptz not null default now()
);

create index idx_submissions_puzzle      on public.submissions(puzzle_id);
create index idx_submissions_puzzle_user on public.submissions(puzzle_id, user_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

alter table public.submissions enable row level security;

-- Players log their own submissions, only for puzzles they can see.
create policy "Users can log own submissions"
  on public.submissions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_can_see_puzzle(auth.uid(), puzzle_id)
  );

-- A player can read their own submissions; a creator can read all
-- submissions on a puzzle they made (so they can see who flailed).
create policy "Users can view own or own-puzzle submissions"
  on public.submissions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.puzzles
      where id = submissions.puzzle_id
        and creator_id = auth.uid()
    )
  );

-- ============================================================
-- PER-PUZZLE SUBMISSION STATS
-- One row per group member who has submitted anything on the puzzle,
-- including those who never completed it (completed = false).
-- ============================================================

create or replace function public.get_puzzle_submission_stats(
  p_puzzle_id uuid,
  p_group_id uuid
)
returns table (
  user_id           uuid,
  username          text,
  display_name      text,
  invalid_count     bigint,
  total_submissions bigint,
  completed         boolean
)
language sql
stable
security definer
as $$
  select
    s.user_id,
    u.username,
    u.display_name,
    count(*) filter (where s.is_valid = false) as invalid_count,
    count(*)                                    as total_submissions,
    exists (
      select 1 from public.attempts a
      where a.puzzle_id = p_puzzle_id
        and a.user_id = s.user_id
    ) as completed
  from public.submissions s
  join public.users u on u.id = s.user_id
  join public.group_members gm
    on gm.user_id = s.user_id and gm.group_id = p_group_id
  where s.puzzle_id = p_puzzle_id
  group by s.user_id, u.username, u.display_name
  order by invalid_count desc, total_submissions desc;
$$;
