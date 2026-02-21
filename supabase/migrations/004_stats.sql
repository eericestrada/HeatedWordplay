-- ============================================================
-- Heated Wordplay — Stats & Leaderboard Functions
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- 1. PER-PUZZLE STATS
-- Shows how a group performed on a specific puzzle:
-- solve rate, guess distribution, individual results
-- ============================================================

create or replace function public.get_puzzle_stats(p_puzzle_id uuid, p_group_id uuid)
returns json
language plpgsql
stable
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_attempts', count(*),
    'total_solved', count(*) filter (where a.medal is not null),
    'avg_guesses', round(avg(a.total_guesses)::numeric, 1),
    'guess_distribution', json_build_object(
      '1', count(*) filter (where a.total_guesses = 1),
      '2', count(*) filter (where a.total_guesses = 2),
      '3', count(*) filter (where a.total_guesses = 3),
      '4', count(*) filter (where a.total_guesses = 4),
      '5', count(*) filter (where a.total_guesses = 5),
      '6', count(*) filter (where a.total_guesses = 6)
    ),
    'solvers', (
      select coalesce(json_agg(json_build_object(
        'user_id', a2.user_id,
        'username', u.username,
        'display_name', u.display_name,
        'medal', a2.medal,
        'total_guesses', a2.total_guesses,
        'score', a2.score,
        'completed_at', a2.completed_at
      ) order by a2.score desc, a2.total_guesses asc), '[]'::json)
      from public.attempts a2
      join public.users u on u.id = a2.user_id
      join public.group_members gm on gm.user_id = a2.user_id and gm.group_id = p_group_id
      where a2.puzzle_id = p_puzzle_id
        and a2.is_own_puzzle = false
    )
  ) into result
  from public.attempts a
  join public.group_members gm on gm.user_id = a.user_id and gm.group_id = p_group_id
  where a.puzzle_id = p_puzzle_id
    and a.is_own_puzzle = false;

  return result;
end;
$$;

-- ============================================================
-- 2. GROUP LEADERBOARD
-- Ranks players within a group by total score, medals, etc.
-- Only counts attempts on puzzles shared to this group.
-- ============================================================

create or replace function public.get_group_leaderboard(p_group_id uuid)
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  total_score      bigint,
  puzzles_solved   bigint,
  puzzles_failed   bigint,
  gold_count       bigint,
  silver_count     bigint,
  bronze_count     bigint,
  avg_guesses      numeric,
  best_score       int
)
language sql
stable
security definer
as $$
  select
    u.id as user_id,
    u.username,
    u.display_name,
    coalesce(sum(a.score), 0) as total_score,
    count(*) filter (where a.medal is not null) as puzzles_solved,
    count(*) filter (where a.medal is null) as puzzles_failed,
    count(*) filter (where a.medal = 'gold') as gold_count,
    count(*) filter (where a.medal = 'silver') as silver_count,
    count(*) filter (where a.medal = 'bronze') as bronze_count,
    round(avg(a.total_guesses) filter (where a.medal is not null), 1) as avg_guesses,
    coalesce(max(a.score), 0) as best_score
  from public.group_members gm
  join public.users u on u.id = gm.user_id
  left join public.attempts a on a.user_id = gm.user_id and a.is_own_puzzle = false
  where gm.group_id = p_group_id
  group by u.id, u.username, u.display_name
  order by total_score desc, puzzles_solved desc;
$$;

-- ============================================================
-- 3. PERSONAL CAREER STATS
-- Overall stats for a single player across all their attempts.
-- ============================================================

create or replace function public.get_player_stats(p_user_id uuid)
returns json
language plpgsql
stable
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_attempted', count(*),
    'total_solved', count(*) filter (where a.medal is not null),
    'total_failed', count(*) filter (where a.medal is null),
    'total_score', coalesce(sum(a.score), 0),
    'best_score', coalesce(max(a.score), 0),
    'gold_count', count(*) filter (where a.medal = 'gold'),
    'silver_count', count(*) filter (where a.medal = 'silver'),
    'bronze_count', count(*) filter (where a.medal = 'bronze'),
    'avg_guesses', round(avg(a.total_guesses) filter (where a.medal is not null), 1),
    'puzzles_created', (
      select count(*) from public.puzzles p where p.creator_id = p_user_id
    ),
    'puzzles_played_by_others', (
      select count(*)
      from public.attempts a2
      join public.puzzles p on p.id = a2.puzzle_id
      where p.creator_id = p_user_id
        and a2.user_id != p_user_id
    ),
    -- Current solve streak: consecutive days with at least one solve
    'current_solve_streak', (
      with daily_solves as (
        select distinct (a2.completed_at at time zone 'UTC')::date as solve_date
        from public.attempts a2
        where a2.user_id = p_user_id
          and a2.medal is not null
          and a2.is_own_puzzle = false
        order by solve_date desc
      ),
      numbered as (
        select solve_date,
          solve_date - (row_number() over (order by solve_date desc))::int as grp
        from daily_solves
      )
      select count(*)
      from numbered
      where grp = (
        select grp from numbered
        where solve_date >= current_date - 1
        order by solve_date desc
        limit 1
      )
    )
  ) into result
  from public.attempts a
  where a.user_id = p_user_id
    and a.is_own_puzzle = false;

  return result;
end;
$$;

-- ============================================================
-- 4. CREATOR STATS
-- How a player's submitted puzzles have performed.
-- ============================================================

create or replace function public.get_creator_stats(p_user_id uuid)
returns json
language plpgsql
stable
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_puzzles', count(distinct p.id),
    'total_plays', count(a.id),
    'total_solves', count(a.id) filter (where a.medal is not null),
    'total_fails', count(a.id) filter (where a.medal is null),
    'avg_guesses', round(avg(a.total_guesses), 1),
    'stump_rate', case
      when count(a.id) > 0 then round(
        (count(a.id) filter (where a.medal is null))::numeric / count(a.id) * 100, 0
      )
      else 0
    end,
    'puzzles', (
      select coalesce(json_agg(json_build_object(
        'puzzle_id', p2.id,
        'word', p2.word,
        'complexity', p2.complexity,
        'created_at', p2.created_at,
        'play_count', (select count(*) from public.attempts a2 where a2.puzzle_id = p2.id and a2.user_id != p_user_id),
        'solve_count', (select count(*) from public.attempts a2 where a2.puzzle_id = p2.id and a2.user_id != p_user_id and a2.medal is not null),
        'avg_guesses', (select round(avg(a2.total_guesses), 1) from public.attempts a2 where a2.puzzle_id = p2.id and a2.user_id != p_user_id)
      ) order by p2.created_at desc), '[]'::json)
      from public.puzzles p2
      where p2.creator_id = p_user_id
    )
  ) into result
  from public.puzzles p
  left join public.attempts a on a.puzzle_id = p.id and a.user_id != p_user_id
  where p.creator_id = p_user_id;

  return result;
end;
$$;
