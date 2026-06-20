-- ============================================================
-- Heated Wordplay — Group puzzles difficulty
-- ============================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================
--
-- Captures get_group_puzzles in version control (it previously lived only in
-- the database) and adds a `has_breakdown` flag so the Groups "puzzles" tab
-- can show the difficulty tier icon (only for v1-scored puzzles). Adding a
-- column changes the return type, so the function is dropped and recreated.
-- Body is otherwise the current definition.
-- ============================================================

drop function if exists public.get_group_puzzles(uuid, uuid);

create or replace function public.get_group_puzzles(p_group_id uuid, p_user_id uuid)
returns table(
  puzzle_id uuid,
  creator_username text,
  creator_display_name text,
  word_length integer,
  complexity numeric,
  has_breakdown boolean,
  has_clue boolean,
  created_at timestamp with time zone,
  has_attempted boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.id as puzzle_id,
    u.username as creator_username,
    u.display_name as creator_display_name,
    char_length(p.word) as word_length,
    p.complexity,
    (p.difficulty_breakdown is not null) as has_breakdown,
    (p.clue is not null and p.clue <> '') as has_clue,
    p.created_at,
    exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = p_user_id
    ) as has_attempted
  from public.puzzle_shares ps
  join public.puzzles p on p.id = ps.puzzle_id
  join public.users u on u.id = p.creator_id
  where ps.target_id = p_group_id
    and ps.share_type = 'group'
    and exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = p_user_id
    )
  order by p.created_at desc;
$function$;
