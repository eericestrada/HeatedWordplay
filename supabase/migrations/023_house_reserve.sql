-- ============================================================
-- Migration 023: House reserve + automatic Daily scheduling
-- ============================================================
-- Keeps Daily Heat from ever going dark. Editors bulk-import vetted "House"
-- words into a reserve; a cron job fills any empty day in the next few days
-- with a random reserve word, and the client asks for an on-demand fill if it
-- still finds today empty.
--
-- House words have no submitter (there is no House login). WordMaster
-- submissions are NEVER auto-scheduled — only source = 'house' rows are drawn.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR. Requires the pg_cron extension
-- (Dashboard -> Database -> Extensions) if the create extension below is
-- refused.
-- ============================================================

-- ---- 1. Source of each word; House words have no submitter ----
alter table public.daily_words
  add column source text not null default 'wordmaster'
    check (source in ('wordmaster', 'house'));

alter table public.daily_words
  alter column submitted_by drop not null;

alter table public.daily_words
  add constraint daily_words_submitter_matches_source
    check ((source = 'house') = (submitted_by is null));

-- True when the scheduler (not an editor) put this word on its date. Cleared
-- when an editor schedules or unschedules the word by hand.
alter table public.daily_words
  add column auto_scheduled boolean not null default false;

create index idx_daily_words_house_reserve
  on public.daily_words(id)
  where source = 'house' and status = 'pending' and scheduled_date is null;

-- ---- 2. Words an editor turned down during import ----
-- Kept out of daily_words so a rejected House candidate doesn't block a
-- WordMaster from submitting the same word later. Only the import Edge
-- Function (service role) touches this: RLS on, no policies.
create table public.house_word_rejects (
  word        text primary key,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz not null default now()
);

alter table public.house_word_rejects enable row level security;

-- ---- 3. Calendar view: left join so House rows (no submitter) still appear ----
create or replace view public.daily_words_calendar as
select
  dw.id,
  dw.scheduled_date,
  dw.status,
  dw.word_length,
  dw.created_at,
  dw.submitted_by,
  coalesce(u.username, 'house') as submitted_by_username,
  case when dw.source = 'house' then 'House' else u.display_name end as submitted_by_display_name,
  case
    when dw.submitted_by = auth.uid() then dw.word
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.word
    when dw.status = 'used' then dw.word
    else null
  end as word,
  case
    when dw.submitted_by = auth.uid() then dw.definition
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.definition
    when dw.status = 'used' then dw.definition
    when dw.scheduled_date = current_date and dw.status = 'scheduled' then dw.definition
    else null
  end as definition,
  case
    when dw.submitted_by = auth.uid() then dw.part_of_speech
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.part_of_speech
    when dw.status = 'used' then dw.part_of_speech
    when dw.scheduled_date = current_date and dw.status = 'scheduled' then dw.part_of_speech
    else null
  end as part_of_speech,
  dw.source,
  dw.auto_scheduled
from public.daily_words dw
left join public.users u on u.id = dw.submitted_by;

grant select on public.daily_words_calendar to authenticated;

-- ---- 4. Fill empty days from the House reserve ----
-- For each day in [p_from, p_from + p_days), if nothing is scheduled, move a
-- random reserve word onto it. Returns how many days it filled. Safe to run
-- concurrently: the unique scheduled_date constraint rejects a second word for
-- the same day, and SKIP LOCKED keeps two runs from grabbing the same word.
create or replace function public.fill_daily_schedule(
  p_from date default current_date,
  p_days int default 3
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
    order by random()
    limit 1
    for update skip locked;

    exit when pick is null;  -- reserve is empty

    begin
      update daily_words
      set scheduled_date = d, status = 'scheduled', auto_scheduled = true
      where id = pick;
      filled := filled + 1;
    exception when unique_violation then
      null;  -- another run filled this day first
    end;
  end loop;
  return filled;
end;
$$;

revoke all on function public.fill_daily_schedule(date, int) from public, anon, authenticated;
grant execute on function public.fill_daily_schedule(date, int) to service_role;

-- ---- 5. On-demand fill for a single day (called by the client) ----
-- The client asks by its local date, so allow one day either side of the
-- server's UTC date — nothing further, so clients can't drain the reserve.
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

revoke all on function public.ensure_daily_word(date) from public, anon;
grant execute on function public.ensure_daily_word(date) to authenticated;

-- ---- 6. Import candidates from the frequency list (service role only) ----
-- Random 4-8 letter words in a zipf band that aren't already in the pool or
-- rejected. Drops obvious inflections (plural / past / -ing forms whose stem is
-- also in the list) so the dictionary lookups aren't wasted on them.
create or replace function public.suggest_house_candidates(
  p_min_zipf real,
  p_max_zipf real,
  p_limit int default 40
)
returns table (word text, zipf real)
language sql
security definer
set search_path = public
as $$
  select w.word, w.zipf
  from word_frequency w
  where w.zipf between p_min_zipf and p_max_zipf
    and w.word ~ '^[a-z]{4,8}$'
    and not exists (select 1 from daily_words dw where dw.word = upper(w.word))
    and not exists (select 1 from house_word_rejects r where r.word = upper(w.word))
    and not exists (
      select 1 from word_frequency s
      where s.word in (
        case when w.word like '%s'   then left(w.word, -1) end,
        case when w.word like '%es'  then left(w.word, -2) end,
        case when w.word like '%ed'  then left(w.word, -2) end,
        case when w.word like '%ed'  then left(w.word, -1) end,
        case when w.word like '%ing' then left(w.word, -3) end,
        case when w.word like '%ing' then left(w.word, -3) || 'e' end,
        -- doubled final consonant: deferred -> defer, stopping -> stop
        case when w.word ~ '([b-df-hj-np-tv-z])\1ed$'  then left(w.word, -3) end,
        case when w.word ~ '([b-df-hj-np-tv-z])\1ing$' then left(w.word, -4) end
      )
    )
  order by random()
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.suggest_house_candidates(real, real, int) from public, anon, authenticated;
grant execute on function public.suggest_house_candidates(real, real, int) to service_role;

-- ---- 7. Schedule the filler: just after UTC midnight, and again mid-day ----
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'fill-daily-schedule',
  '5 0,12 * * *',
  $$select public.fill_daily_schedule()$$
);
