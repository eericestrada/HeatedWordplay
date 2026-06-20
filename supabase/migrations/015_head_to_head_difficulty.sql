-- ============================================================
-- Heated Wordplay — Head-to-head difficulty
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- Supersedes migration 013 — running it alone is sufficient.
-- ============================================================
--
-- Adds each word's difficulty `complexity` and a `has_breakdown` flag (whether
-- the puzzle was scored with the new difficulty model) to the head-to-head
-- rows, so the screen can show the difficulty tier icon next to the medal.
-- Returns json, so the shape can change with a plain CREATE OR REPLACE.
-- ============================================================

create or replace function public.get_head_to_head(p_user_id uuid, p_partner_id uuid)
returns json
language plpgsql
stable
security definer
as $$
declare
  result json;
begin
  if p_user_id <> auth.uid() then
    return null;
  end if;

  select json_build_object(
    'yours', (
      select coalesce(json_agg(json_build_object(
        'puzzle_id', p.id,
        'word', p.word,
        'medal', a.medal,
        'surrendered', a.surrendered,
        'total_guesses', a.total_guesses,
        'complexity', p.complexity,
        'has_breakdown', (p.difficulty_breakdown is not null),
        'completed_at', a.completed_at
      ) order by a.completed_at desc), '[]'::json)
      from public.attempts a
      join public.puzzles p on p.id = a.puzzle_id
      where p.creator_id = p_user_id
        and a.user_id = p_partner_id
        and a.is_own_puzzle = false
    ),
    'theirs', (
      select coalesce(json_agg(json_build_object(
        'puzzle_id', p.id,
        'word', p.word,
        'medal', a.medal,
        'surrendered', a.surrendered,
        'total_guesses', a.total_guesses,
        'complexity', p.complexity,
        'has_breakdown', (p.difficulty_breakdown is not null),
        'completed_at', a.completed_at
      ) order by a.completed_at desc), '[]'::json)
      from public.attempts a
      join public.puzzles p on p.id = a.puzzle_id
      where p.creator_id = p_partner_id
        and a.user_id = p_user_id
        and a.is_own_puzzle = false
    )
  ) into result;

  return result;
end;
$$;
