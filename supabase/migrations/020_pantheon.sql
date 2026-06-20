-- ============================================================
-- Heated Wordplay — The Pantheon (per-word "Torment" raw stats)
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- New function only — no schema changes.
-- ============================================================
--
-- Returns, for each of the caller's own words that has seen any struggle, the
-- raw ingredients of a "Torment" score:
--   - dead_ends: total invalid words tried by OTHERS (the live submission log,
--     so it includes people who flailed and never finished — abandoners), and
--   - solved / stumped / surrendered attempt counts.
--
-- The Torment score itself (dead_ends x difficulty weight + give-up bonuses) is
-- computed client-side so the weights stay easy to retune without a migration.
-- Difficulty (complexity / breakdown) is returned so the client can weight and
-- badge each word by tier.
-- ============================================================

create or replace function public.get_pantheon()
returns json
language sql
stable
security definer
as $$
  select coalesce(json_agg(row_to_json(t) order by t.dead_ends desc), '[]'::json)
  from (
    select
      p.id                                  as puzzle_id,
      p.word                                as word,
      p.complexity                          as complexity,
      (p.difficulty_breakdown is not null)  as has_breakdown,
      coalesce(de.dead_ends, 0)             as dead_ends,
      coalesce(at.solved_count, 0)          as solved_count,
      coalesce(at.failed_count, 0)          as failed_count,
      coalesce(at.surrendered_count, 0)     as surrendered_count
    from public.puzzles p
    left join lateral (
      -- dead ends from everyone but the creator; includes abandoners (no attempt)
      select count(*) as dead_ends
      from public.submissions s
      where s.puzzle_id = p.id
        and s.is_valid = false
        and s.user_id <> p.creator_id
    ) de on true
    left join lateral (
      select
        count(*) filter (where a.medal is not null)                     as solved_count,
        count(*) filter (where a.medal is null and a.surrendered = false) as failed_count,
        count(*) filter (where a.surrendered = true)                    as surrendered_count
      from public.attempts a
      where a.puzzle_id = p.id
        and a.is_own_puzzle = false
    ) at on true
    where p.creator_id = auth.uid()
      and (
        coalesce(de.dead_ends, 0) > 0
        or coalesce(at.solved_count, 0)
         + coalesce(at.failed_count, 0)
         + coalesce(at.surrendered_count, 0) > 0
      )
  ) t;
$$;
