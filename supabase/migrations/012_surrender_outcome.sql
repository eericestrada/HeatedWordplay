-- ============================================================
-- Heated Wordplay — Surrender outcome
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- This supersedes migration 011 — running it alone is sufficient.
-- ============================================================
--
-- Adds a `surrendered` flag to attempts so we can tell a genuine miss
-- (❌ stumped — fought all 6) from giving up (🏳️ gave up — the in-game white
-- flag, or a phoned-in final guess). The client/edge function sets it; this
-- migration just adds the column and surfaces it in the creator stats RPC.
-- ============================================================

alter table public.attempts
  add column if not exists surrendered boolean not null default false;

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
        'guesses', a2.guesses
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
