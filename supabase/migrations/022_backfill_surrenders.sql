-- ============================================================
-- Migration 022: Backfill "phoned-in" surrenders (one-off data backfill)
-- ============================================================
-- RUN IN THE SUPABASE SQL EDITOR. Run STEP 1 first (read-only) to see which
-- attempts would flip from stumped to gave-up, then run STEP 2 to apply.
-- ============================================================
--
-- Re-applies the live "gave up" heuristic to historical failed attempts that
-- saved a guess grid. Mirrors phonedInFinalGuess() in evaluate-guess exactly:
-- of the positions locked GREEN before the final guess, if fewer than half are
-- still correct on the final guess, the player phoned it in -> surrendered.
-- If no green was ever locked, there is nothing to abandon -> stays stumped.
--
-- Coverage (the honest limits):
--   * Only the HEURISTIC kind is recoverable — the explicit white-flag didn't
--     exist historically, so there are no manual surrenders to recover.
--   * Only fails with a stored guesses grid (medal IS NULL, total_guesses = 6,
--     surrendered = false, not the creator's own puzzle). Older fails with a
--     NULL grid can't be evaluated and stay stumped.
--
-- The grid already encodes each cell's correct/present/absent, so no answer
-- word is needed. No score impact (stumped and gave-up both score 0); this only
-- reclassifies the outcome (Review / H2H / activity / Pantheon).
--
-- Idempotent: only considers attempts where surrendered = false.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only; highlight this block and Run)
-- ─────────────────────────────────────────────────────────────
-- Lists the attempts that WOULD be reclassified, with the locked/kept counts
-- so you can sanity-check the ratio (< 0.5 = gave up).
with cells as (
  select a.id as attempt_id, p.word,
         r.rn as row_num,
         jsonb_array_length(a.guesses) as nrows,
         c.cn - 1 as pos,
         c.elem->>'status' as status
  from public.attempts a
  join public.puzzles p on p.id = a.puzzle_id
  cross join lateral jsonb_array_elements(a.guesses) with ordinality as r(elem, rn)
  cross join lateral jsonb_array_elements(r.elem->'result') with ordinality as c(elem, cn)
  where a.medal is null
    and a.surrendered = false
    and a.is_own_puzzle = false
    and a.total_guesses = 6
    and a.guesses is not null
    and jsonb_typeof(a.guesses) = 'array'
    and jsonb_array_length(a.guesses) >= 2
),
locked as (  -- positions locked green before the final row
  select attempt_id, word, pos
  from cells
  where status = 'correct' and row_num < nrows
  group by attempt_id, word, pos
),
kept as (    -- locked positions still correct on the final row
  select c.attempt_id, c.pos
  from cells c
  join locked l on l.attempt_id = c.attempt_id and l.pos = c.pos
  where c.row_num = c.nrows and c.status = 'correct'
),
agg as (
  select l.attempt_id, max(l.word) as word,
         count(distinct l.pos) as locked_cnt,
         count(distinct k.pos) as kept_cnt
  from locked l
  left join kept k on k.attempt_id = l.attempt_id and k.pos = l.pos
  group by l.attempt_id
)
select attempt_id, word, locked_cnt, kept_cnt,
       round(kept_cnt::numeric / locked_cnt, 2) as kept_ratio
from agg
where locked_cnt > 0 and kept_cnt::numeric / locked_cnt < 0.5
order by kept_ratio, word;

-- ─────────────────────────────────────────────────────────────
-- STEP 2 — APPLY (highlight from here down and Run)
-- ─────────────────────────────────────────────────────────────
with cells as (
  select a.id as attempt_id,
         r.rn as row_num,
         jsonb_array_length(a.guesses) as nrows,
         c.cn - 1 as pos,
         c.elem->>'status' as status
  from public.attempts a
  cross join lateral jsonb_array_elements(a.guesses) with ordinality as r(elem, rn)
  cross join lateral jsonb_array_elements(r.elem->'result') with ordinality as c(elem, cn)
  where a.medal is null
    and a.surrendered = false
    and a.is_own_puzzle = false
    and a.total_guesses = 6
    and a.guesses is not null
    and jsonb_typeof(a.guesses) = 'array'
    and jsonb_array_length(a.guesses) >= 2
),
locked as (
  select attempt_id, pos
  from cells
  where status = 'correct' and row_num < nrows
  group by attempt_id, pos
),
kept as (
  select c.attempt_id, c.pos
  from cells c
  join locked l on l.attempt_id = c.attempt_id and l.pos = c.pos
  where c.row_num = c.nrows and c.status = 'correct'
),
agg as (
  select l.attempt_id,
         count(distinct l.pos) as locked_cnt,
         count(distinct k.pos) as kept_cnt
  from locked l
  left join kept k on k.attempt_id = l.attempt_id and k.pos = l.pos
  group by l.attempt_id
)
update public.attempts
set surrendered = true
where id in (
  select attempt_id from agg
  where locked_cnt > 0 and kept_cnt::numeric / locked_cnt < 0.5
);

-- Verify: count of attempts now flagged as gave-up.
select count(*) as total_surrendered from public.attempts where surrendered = true;
