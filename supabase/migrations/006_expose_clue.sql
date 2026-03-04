-- Migration 006: Expose clue in puzzles_visible view
-- Clues are now free (no score penalty), so they should be visible
-- to all users during gameplay, not hidden until after completion.

create or replace view public.puzzles_visible as
select
  p.id,
  p.creator_id,
  p.complexity,
  p.is_public,
  p.created_at,
  -- Only reveal answer data if user is creator or has completed attempt
  case
    when p.creator_id = auth.uid() then p.word
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.word
    else null
  end as word,
  case
    when p.creator_id = auth.uid() then p.definition
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.definition
    else null
  end as definition,
  case
    when p.creator_id = auth.uid() then p.part_of_speech
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.part_of_speech
    else null
  end as part_of_speech,
  -- Clues are free (no score penalty) — always expose them
  p.clue as clue,
  case
    when p.creator_id = auth.uid() then p.inspo
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.inspo
    else null
  end as inspo,
  -- Always visible metadata
  char_length(p.word) as word_length,
  u.username as creator_username,
  u.display_name as creator_display_name,
  -- Has the current user completed this puzzle?
  exists (
    select 1 from public.attempts a
    where a.puzzle_id = p.id and a.user_id = auth.uid()
  ) as has_attempted,
  -- Creator's clue existence (so UI knows to show clue button)
  (p.clue is not null and p.clue != '') as has_clue
from public.puzzles p
join public.users u on u.id = p.creator_id;
