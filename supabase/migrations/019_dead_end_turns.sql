-- ============================================================
-- Heated Wordplay — Per-turn dead-end (invalid word) tracking
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- Supersedes the get_puzzle_submission_stats body in migration 008 and the
-- get_creator_puzzle_stats body in migration 018 — running this alone is
-- sufficient for both functions.
-- ============================================================
--
-- Until now `submissions` recorded each word a player tried (valid or not) but
-- not WHICH guess it was for, so dead ends (invalid words that don't consume a
-- guess) were only available as a running total per puzzle. This stamps every
-- submission with the guess number it was attempted on, so we can show how
-- many dead ends a word produced on each turn — i.e. how much it tormented the
-- guesser. Mirrors the per-turn magnet tracking (`magnet_turns`): the read
-- side returns `dead_end_turns int[]`, an array of guess numbers (e.g. {1,1,3}
-- = two dead ends on guess 1, one on guess 3), so the UI can count per turn.
--
-- Existing submission rows keep guess_number NULL (pre-tracking) and are simply
-- excluded from the per-turn arrays.
-- ============================================================

alter table public.submissions
  add column if not exists guess_number int;

-- ============================================================
-- GROUP-SCOPED SUBMISSION STATS — now also returns the per-turn dead-end
-- series (`dead_end_turns`) alongside the existing running totals.
-- The added OUT column changes the function's return type, which
-- `create or replace` cannot do — drop it first.
-- ============================================================

drop function if exists public.get_puzzle_submission_stats(uuid, uuid);

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
  completed         boolean,
  dead_end_turns    int[]
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
    ) as completed,
    coalesce(
      array_agg(s.guess_number order by s.guess_number)
        filter (where s.is_valid = false and s.guess_number is not null),
      '{}'::int[]
    ) as dead_end_turns
  from public.submissions s
  join public.users u on u.id = s.user_id
  join public.group_members gm
    on gm.user_id = s.user_id and gm.group_id = p_group_id
  where s.puzzle_id = p_puzzle_id
  group by s.user_id, u.username, u.display_name
  order by invalid_count desc, total_submissions desc;
$$;

-- ============================================================
-- CREATOR-SCOPED PUZZLE STATS — each solver now carries `dead_end_turns`,
-- aggregated from the submissions log (invalid words only), so the creator's
-- puzzle detail can show per-turn dead ends per solver.
-- ============================================================

create or replace function public.get_creator_puzzle_stats(p_puzzle_id uuid)
returns json
language plpgsql
stable
security definer
as $$
declare
  v_creator uuid;
  result json;
begin
  select creator_id into v_creator from public.puzzles where id = p_puzzle_id;
  if v_creator is null or v_creator <> auth.uid() then
    return null;
  end if;

  select json_build_object(
    'total_attempts', count(*),
    'total_solved', count(*) filter (where a.medal is not null),
    'avg_guesses', round(avg(a.total_guesses)::numeric, 1),
    'guess_distribution', json_build_object(
      '1', count(*) filter (where a.total_guesses = 1 and a.medal is not null),
      '2', count(*) filter (where a.total_guesses = 2 and a.medal is not null),
      '3', count(*) filter (where a.total_guesses = 3 and a.medal is not null),
      '4', count(*) filter (where a.total_guesses = 4 and a.medal is not null),
      '5', count(*) filter (where a.total_guesses = 5 and a.medal is not null),
      '6', count(*) filter (where a.total_guesses = 6 and a.medal is not null)
    ),
    'solvers', (
      select coalesce(json_agg(json_build_object(
        'user_id', a2.user_id,
        'username', u.username,
        'display_name', u.display_name,
        'medal', a2.medal,
        'total_guesses', a2.total_guesses,
        'score', a2.score,
        'completed_at', a2.completed_at,
        'surrendered', a2.surrendered,
        'magnets_used', a2.magnets_used,
        'magnet_turns', a2.magnet_turns,
        'guesses', a2.guesses,
        'dead_end_turns', coalesce((
          select array_agg(s.guess_number order by s.guess_number)
          from public.submissions s
          where s.puzzle_id = p_puzzle_id
            and s.user_id = a2.user_id
            and s.is_valid = false
            and s.guess_number is not null
        ), '{}'::int[])
      ) order by (a2.medal is not null) desc, a2.score desc, a2.total_guesses asc), '[]'::json)
      from public.attempts a2
      join public.users u on u.id = a2.user_id
      where a2.puzzle_id = p_puzzle_id
        and a2.is_own_puzzle = false
    )
  ) into result
  from public.attempts a
  where a.puzzle_id = p_puzzle_id
    and a.is_own_puzzle = false;

  return result;
end;
$$;
