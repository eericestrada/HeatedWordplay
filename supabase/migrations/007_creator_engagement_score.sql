-- Migration 007: Creator Engagement Score
-- Adds creator engagement scoring to the leaderboard and player stats.
-- Formula: per puzzle = (total_plays × 10) + (total_fails × 5)
-- This incentivizes users who create puzzles for the community.

-- ============================================================
-- 1. Updated GROUP LEADERBOARD with creator engagement score
-- ============================================================

-- Must drop first — return type is changing (adding creator_engagement column)
drop function if exists public.get_group_leaderboard(uuid);

create or replace function public.get_group_leaderboard(p_group_id uuid)
returns table (
  user_id            uuid,
  username           text,
  display_name       text,
  total_score        bigint,
  puzzles_solved     bigint,
  puzzles_failed     bigint,
  gold_count         bigint,
  silver_count       bigint,
  bronze_count       bigint,
  avg_guesses        numeric,
  best_score         int,
  creator_engagement bigint
)
language sql
stable
security definer
as $$
  select
    u.id as user_id,
    u.username,
    u.display_name,
    coalesce(sum(a.score), 0)
      + coalesce((
          select sum(sub.play_count * 10 + sub.fail_count * 5)
          from (
            select
              count(a2.id) as play_count,
              count(a2.id) filter (where a2.medal is null) as fail_count
            from public.puzzles p2
            left join public.attempts a2
              on a2.puzzle_id = p2.id
              and a2.user_id != p2.creator_id
              and a2.is_own_puzzle = false
            where p2.creator_id = u.id
            group by p2.id
          ) sub
        ), 0)
    as total_score,
    count(*) filter (where a.medal is not null) as puzzles_solved,
    count(*) filter (where a.medal is null) as puzzles_failed,
    count(*) filter (where a.medal = 'gold') as gold_count,
    count(*) filter (where a.medal = 'silver') as silver_count,
    count(*) filter (where a.medal = 'bronze') as bronze_count,
    round(avg(a.total_guesses) filter (where a.medal is not null), 1) as avg_guesses,
    coalesce(max(a.score), 0) as best_score,
    coalesce((
      select sum(sub.play_count * 10 + sub.fail_count * 5)
      from (
        select
          count(a2.id) as play_count,
          count(a2.id) filter (where a2.medal is null) as fail_count
        from public.puzzles p2
        left join public.attempts a2
          on a2.puzzle_id = p2.id
          and a2.user_id != p2.creator_id
          and a2.is_own_puzzle = false
        where p2.creator_id = u.id
        group by p2.id
      ) sub
    ), 0) as creator_engagement
  from public.group_members gm
  join public.users u on u.id = gm.user_id
  left join public.attempts a on a.user_id = gm.user_id and a.is_own_puzzle = false
  where gm.group_id = p_group_id
  group by u.id, u.username, u.display_name
  order by total_score desc, puzzles_solved desc;
$$;

-- ============================================================
-- 2. Updated PLAYER STATS with creator engagement score
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
    'creator_engagement_score', (
      select coalesce(sum(sub.play_count * 10 + sub.fail_count * 5), 0)
      from (
        select
          count(a2.id) as play_count,
          count(a2.id) filter (where a2.medal is null) as fail_count
        from public.puzzles p2
        left join public.attempts a2
          on a2.puzzle_id = p2.id
          and a2.user_id != p2.creator_id
          and a2.is_own_puzzle = false
        where p2.creator_id = p_user_id
        group by p2.id
      ) sub
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
