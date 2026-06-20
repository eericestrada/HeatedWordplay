-- ============================================================
-- Heated Wordplay — Activity feed difficulty
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- Supersedes migration 014 — running it alone is sufficient.
-- ============================================================
--
-- Adds each puzzle's `complexity` and a `has_breakdown` flag to the activity
-- rows so the feed can show the difficulty tier icon next to the outcome.
-- Adding columns changes the return type, so the function is dropped and
-- recreated. Body is otherwise the migration-014 version.
-- ============================================================

drop function if exists public.get_group_activity(uuid, integer);

create or replace function public.get_group_activity(p_group_id uuid, p_limit integer default 20)
returns table(
  id uuid,
  puzzle_id uuid,
  player_username text,
  player_display_name text,
  creator_username text,
  creator_display_name text,
  word_length integer,
  medal text,
  total_guesses integer,
  score integer,
  surrendered boolean,
  complexity integer,
  has_breakdown boolean,
  completed_at timestamp with time zone
)
language sql
stable
security definer
as $function$
  select
    a.id,
    a.puzzle_id,
    u_player.username,
    u_player.display_name,
    u_creator.username,
    u_creator.display_name,
    char_length(p.word),
    a.medal,
    a.total_guesses,
    a.score,
    a.surrendered,
    p.complexity,
    (p.difficulty_breakdown is not null),
    a.completed_at
  from public.attempts a
  join public.users u_player on u_player.id = a.user_id
  join public.puzzles p on p.id = a.puzzle_id
  join public.users u_creator on u_creator.id = p.creator_id
  join public.puzzle_shares ps on ps.puzzle_id = a.puzzle_id
    and ps.share_type = 'group'
    and ps.target_id = p_group_id
  join public.group_members gm on gm.group_id = p_group_id
    and gm.user_id = a.user_id
  where a.is_own_puzzle = false
    and a.completed_at is not null
    and exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = auth.uid()
    )
  order by a.completed_at desc
  limit p_limit;
$function$;
