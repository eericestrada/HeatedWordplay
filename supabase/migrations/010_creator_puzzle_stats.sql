-- ============================================================
-- Heated Wordplay — Creator-scoped per-puzzle stats
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================
--
-- get_puzzle_stats() is GROUP-scoped — it only returns solvers who belong to
-- one specific group. The "My Words" puzzle detail needs every solver across
-- ALL audiences a word was shared to (groups + individuals + public + link),
-- so this function is CREATOR-scoped instead: only the puzzle's creator may
-- call it, and it counts every attempt regardless of how the solver got the
-- word.
--
-- Slice 4 will extend the solver objects with each player's `guesses` grid and
-- a richer outcome (solved / stumped / gave up).
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
  -- Only the creator may see cross-audience stats for their own puzzle.
  select creator_id into v_creator from public.puzzles where id = p_puzzle_id;
  if v_creator is null or v_creator <> auth.uid() then
    return null;
  end if;

  select json_build_object(
    'total_attempts', count(*),
    'total_solved', count(*) filter (where a.medal is not null),
    'avg_guesses', round(avg(a.total_guesses)::numeric, 1),
    -- Distribution counts SOLVED attempts by guess count (solve-in-N bars).
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
        'completed_at', a2.completed_at
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
