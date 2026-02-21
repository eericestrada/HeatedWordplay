-- ============================================================
-- Heated Wordplay — Pair Streaks
-- ============================================================
-- Computes bilateral daily streaks between pairs of players.
-- A streak day = a calendar day (UTC) where at least one puzzle
-- was completed between the pair (either direction).
-- The streak counts consecutive days backward from the most
-- recent activity. If the most recent day is before yesterday,
-- the streak is 0 (broken).
-- ============================================================

-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard > SQL Editor)

create or replace function public.get_pair_streaks(p_user_id uuid)
returns table (
  partner_id       uuid,
  partner_username text,
  partner_display_name text,
  current_streak   int,
  last_activity_date date,
  total_completions bigint
)
language plpgsql
stable
security definer
as $$
declare
  r record;
  prev_date date;
  streak int;
  activity_dates date[];
  d date;
  today date := current_date;
begin
  -- For each partner the user has interacted with:
  for r in
    select
      partner.id as pid,
      partner.username as pusername,
      partner.display_name as pdisplay,
      array_agg(distinct activity_day order by activity_day desc) as days,
      count(*) as total
    from (
      -- User solved partner's puzzle
      select
        p.creator_id as partner_id,
        (a.completed_at at time zone 'UTC')::date as activity_day
      from public.attempts a
      join public.puzzles p on p.id = a.puzzle_id
      where a.user_id = p_user_id
        and a.is_own_puzzle = false
        and p.creator_id != p_user_id

      union all

      -- Partner solved user's puzzle
      select
        a.user_id as partner_id,
        (a.completed_at at time zone 'UTC')::date as activity_day
      from public.attempts a
      join public.puzzles p on p.id = a.puzzle_id
      where p.creator_id = p_user_id
        and a.is_own_puzzle = false
        and a.user_id != p_user_id
    ) interactions
    join public.users partner on partner.id = interactions.partner_id
    group by partner.id, partner.username, partner.display_name
  loop
    activity_dates := r.days;  -- already sorted desc

    -- If the most recent activity is before yesterday, streak is broken
    if activity_dates[1] < today - 1 then
      streak := 0;
    else
      -- Count consecutive days backward from the most recent
      streak := 1;
      prev_date := activity_dates[1];
      for i in 2 .. array_length(activity_dates, 1) loop
        d := activity_dates[i];
        if prev_date - d = 1 then
          streak := streak + 1;
          prev_date := d;
        else
          exit;  -- gap found, stop counting
        end if;
      end loop;
    end if;

    partner_id := r.pid;
    partner_username := r.pusername;
    partner_display_name := r.pdisplay;
    current_streak := streak;
    last_activity_date := activity_dates[1];
    total_completions := r.total;
    return next;
  end loop;
end;
$$;
