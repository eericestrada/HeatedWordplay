-- ============================================================
-- Migration 021: Backfill per-turn dead ends (one-off data backfill)
-- ============================================================
-- RUN IN THE SUPABASE SQL EDITOR. Run STEP 1 first (read-only) to eyeball the
-- reconstruction, then run STEP 2 to apply.
-- ============================================================
--
-- Migration 019 added submissions.guess_number, but historical rows are NULL.
-- We can rebuild the turn each submission belongs to by replaying each
-- (puzzle, user) submission stream in time order: a VALID word advances the
-- turn (it became a guess); an INVALID word is a dead end on the current turn.
-- So guess_number = (valid submissions strictly before it) + 1.
--
-- This lights up the per-turn "N x" annotations on the Review screen and the
-- dead_end_turns array in the creator detail. (Pantheon totals already counted
-- these — they don't depend on guess_number.)
--
-- Idempotent: only fills rows where guess_number IS NULL, so re-running is safe.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only; highlight this block and Run)
-- ─────────────────────────────────────────────────────────────

-- How many rows will be filled?
select
  count(*) filter (where guess_number is null) as to_backfill,
  count(*)                                     as total_submissions
from public.submissions;

-- Eyeball the busiest single stream: each row's validity + reconstructed turn.
-- Invalid rows should carry the turn they were attempted on; valid rows step up.
with recon as (
  select id, puzzle_id, user_id, is_valid, created_at,
         1 + coalesce(sum(case when is_valid then 1 else 0 end) over (
               partition by puzzle_id, user_id
               order by created_at, id
               rows between unbounded preceding and 1 preceding), 0) as gn
  from public.submissions
)
select is_valid, created_at, gn
from recon
where (puzzle_id, user_id) = (
  select puzzle_id, user_id
  from public.submissions
  group by puzzle_id, user_id
  order by count(*) desc
  limit 1
)
order by created_at, id;

-- ─────────────────────────────────────────────────────────────
-- STEP 2 — APPLY (highlight from here down and Run)
-- ─────────────────────────────────────────────────────────────

update public.submissions s
set guess_number = sub.gn
from (
  select id,
         1 + coalesce(sum(case when is_valid then 1 else 0 end) over (
               partition by puzzle_id, user_id
               order by created_at, id
               rows between unbounded preceding and 1 preceding), 0) as gn
  from public.submissions
) sub
where s.id = sub.id
  and s.guess_number is null;

-- Verify: should be 0 remaining.
select count(*) as still_null from public.submissions where guess_number is null;
