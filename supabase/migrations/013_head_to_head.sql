-- ============================================================
-- Heated Wordplay — Head-to-head
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================
--
-- Returns the words exchanged between the caller and one partner, each
-- direction, with outcomes — backing the per-friend head-to-head view.
-- The caller may only request their own head-to-head (p_user_id = auth.uid()).
-- The caller can see every word here: words they created (yours) and words
-- they attempted (theirs, already revealed to them).
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
    -- Words the caller sent the partner (caller created, partner attempted)
    'yours', (
      select coalesce(json_agg(json_build_object(
        'puzzle_id', p.id,
        'word', p.word,
        'medal', a.medal,
        'surrendered', a.surrendered,
        'total_guesses', a.total_guesses,
        'completed_at', a.completed_at
      ) order by a.completed_at desc), '[]'::json)
      from public.attempts a
      join public.puzzles p on p.id = a.puzzle_id
      where p.creator_id = p_user_id
        and a.user_id = p_partner_id
        and a.is_own_puzzle = false
    ),
    -- Words the partner sent the caller (partner created, caller attempted)
    'theirs', (
      select coalesce(json_agg(json_build_object(
        'puzzle_id', p.id,
        'word', p.word,
        'medal', a.medal,
        'surrendered', a.surrendered,
        'total_guesses', a.total_guesses,
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
