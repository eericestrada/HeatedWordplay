-- ============================================================
-- Migration 009: Difficulty Scoring v1
-- ============================================================
-- Replaces the Scrabble-letter-sum heuristic with a model based on word
-- rarity + guessing trickiness. Difficulty is computed server-side at
-- submit time (see the submit-word Edge Function) and stored in the
-- existing `puzzles.complexity` column; the per-component breakdown is
-- stored in the new `puzzles.difficulty_breakdown` jsonb.
--
-- Backwards-compatible: existing puzzles keep their old complexity and have
-- a NULL breakdown. The presence of `difficulty_breakdown` is how the app
-- distinguishes a v1-scored puzzle (new tiers) from a legacy one.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR, then bulk-load the seed CSV into
-- word_frequency (see deploy notes).
-- ============================================================

-- ---- Word frequency / word list (OpenSubtitles, 4-8 letter words, zipf >= 1.0) ----
-- Reference data, ~160k rows. Used only server-side (service role) to look up
-- rarity and to find one-edit neighbors for the neighborhood-density term.
create table public.word_frequency (
  word text primary key,
  zipf real not null
);

-- Reference data only — never queried by clients. RLS on with no policy means
-- only the service role (Edge Functions) can read it.
alter table public.word_frequency enable row level security;

-- ---- Per-puzzle difficulty breakdown ----
-- e.g. {"base":5,"rarity":12,"repeat":7.5,"length":0,"flow":1,"concentrated":0,"spread":0,"tier":"hard"}
alter table public.puzzles
  add column difficulty_breakdown jsonb;

-- ---- Expose the breakdown through the read view (numbers only, no answer leak) ----
create or replace view public.puzzles_visible as
select
  p.id,
  p.creator_id,
  p.complexity,
  p.is_public,
  p.created_at,
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
  p.clue as clue,
  case
    when p.creator_id = auth.uid() then p.inspo
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.inspo
    else null
  end as inspo,
  char_length(p.word) as word_length,
  u.username as creator_username,
  u.display_name as creator_display_name,
  exists (
    select 1 from public.attempts a
    where a.puzzle_id = p.id and a.user_id = auth.uid()
  ) as has_attempted,
  (p.clue is not null and p.clue != '') as has_clue,
  p.difficulty_breakdown
from public.puzzles p
join public.users u on u.id = p.creator_id;

grant select on public.puzzles_visible to authenticated;
