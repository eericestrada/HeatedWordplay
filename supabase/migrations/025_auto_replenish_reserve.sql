-- ============================================================
-- Migration 025: Self-replenishing House reserve
-- ============================================================
-- Days still went dark when the reserve ran dry, breaking players' streaks.
-- Now, when the reserve drops to 2 words or fewer, the scheduler tops it up
-- itself from word_definitions (WordNet, migration 024) — no human needed.
--
-- Auto-picked words are flagged (auto_added) so editors can spot and discard
-- them, and reviewed words are always used first.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR.
-- ============================================================

alter table public.daily_words
  add column auto_added boolean not null default false;

-- ---- Top up the reserve with unreviewed picks ----
-- Only acts when the reserve is at or below p_min; then adds enough to reach
-- p_target. Draws from difficulty 6-8 (zipf 2.08-3.25; see the scale in the
-- import-house-words Edge Function) and, stricter than manual import, only
-- words WordNet gives 2+ senses — that screens out most obscure names and
-- taxonomy terms nobody would enjoy as a Daily.
create or replace function public.replenish_house_reserve(
  p_min int default 2,
  p_target int default 10
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  have int;
  added int;
begin
  select count(*) into have
  from daily_words
  where source = 'house' and status = 'pending' and scheduled_date is null;

  if have > p_min then
    return 0;
  end if;

  insert into daily_words (word, definition, part_of_speech, source, submitted_by, auto_added)
  select upper(w.word), d.definition, d.part_of_speech, 'house', null, true
  from word_frequency w
  join word_definitions d on d.word = w.word and d.sense_rank = 1
  where w.zipf between 2.08 and 3.25
    and w.word ~ '^[a-z]{4,8}$'
    and (select count(*) from word_definitions d2 where d2.word = w.word) >= 2
    and not exists (select 1 from daily_words dw where dw.word = upper(w.word))
    and not exists (select 1 from house_word_rejects r where r.word = upper(w.word))
  order by random()
  limit greatest(p_target - have, 0)
  on conflict do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.replenish_house_reserve(int, int) from public, anon, authenticated;
grant execute on function public.replenish_house_reserve(int, int) to service_role;

-- ---- Filler: reviewed words first; optionally generate when dry ----
-- p_generate = true (cron, on-demand player fill): if the reserve runs out
-- mid-fill, top it up and keep going, and leave it topped up afterwards.
-- p_generate = false (an editor's "fill 20 / all"): only use what's there.
drop function if exists public.fill_daily_schedule(date, int);

create function public.fill_daily_schedule(
  p_from date default current_date,
  p_days int default 3,
  p_generate boolean default true
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  pick uuid;
  filled int := 0;
begin
  for i in 0 .. greatest(p_days, 1) - 1 loop
    d := p_from + i;
    continue when exists (select 1 from daily_words where scheduled_date = d);

    select id into pick
    from daily_words
    where source = 'house' and status = 'pending' and scheduled_date is null
    order by auto_added, random()
    limit 1
    for update skip locked;

    if pick is null and p_generate then
      perform replenish_house_reserve(0);
      select id into pick
      from daily_words
      where source = 'house' and status = 'pending' and scheduled_date is null
      order by auto_added, random()
      limit 1
      for update skip locked;
    end if;

    exit when pick is null;  -- reserve is empty (and couldn't be refilled)

    begin
      update daily_words
      set scheduled_date = d, status = 'scheduled', auto_scheduled = true
      where id = pick;
      filled := filled + 1;
    exception when unique_violation then
      null;  -- another run filled this day first
    end;
  end loop;

  if p_generate then
    perform replenish_house_reserve();
  end if;
  return filled;
end;
$$;

revoke all on function public.fill_daily_schedule(date, int, boolean) from public, anon, authenticated;
grant execute on function public.fill_daily_schedule(date, int, boolean) to service_role;

-- ensure_daily_word (023) calls fill_daily_schedule(p_date, 1), which now
-- resolves to the new signature with p_generate = true. Recreate it so the
-- dependency is compiled against the new function.
create or replace function public.ensure_daily_word(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_date between current_date - 1 and current_date + 1 then
    perform fill_daily_schedule(p_date, 1);
  end if;
end;
$$;

-- The cron job from 023 calls fill_daily_schedule() with defaults, so it now
-- generates when needed. Re-register it anyway so the schedule is explicit.
select cron.schedule(
  'fill-daily-schedule',
  '5 0,12 * * *',
  $$select public.fill_daily_schedule()$$
);
