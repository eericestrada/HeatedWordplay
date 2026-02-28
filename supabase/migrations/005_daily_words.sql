-- Migration 005: Daily Words table, user roles, and secure view
-- Adds the WordMaster/Editor role system and the daily_words pool for Daily Heat.

-- ============================================================
-- 1. Add role column to users
-- ============================================================
alter table public.users
  add column role text not null default 'player';

alter table public.users
  add constraint users_role_check
  check (role in ('player', 'wordmaster', 'editor'));

-- ============================================================
-- 2. Create daily_words table
-- ============================================================
create table public.daily_words (
  id              uuid primary key default gen_random_uuid(),
  word            text not null,
  definition      text not null,
  part_of_speech  text not null,
  submitted_by    uuid not null references public.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'scheduled', 'used', 'skipped')),
  scheduled_date  date unique,
  word_length     int not null generated always as (char_length(word)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Prevent duplicate words in the pool
  constraint daily_words_word_unique unique (word)
);

-- Indexes
create index idx_daily_words_scheduled_date on public.daily_words(scheduled_date) where scheduled_date is not null;
create index idx_daily_words_submitted_by on public.daily_words(submitted_by);
create index idx_daily_words_status on public.daily_words(status);

-- Auto-update updated_at on row changes
create or replace function public.update_daily_words_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger daily_words_updated_at
  before update on public.daily_words
  for each row execute function public.update_daily_words_updated_at();

-- ============================================================
-- 3. RLS policies on daily_words
-- ============================================================
alter table public.daily_words enable row level security;

-- WordMasters can view their own submitted words (all fields)
create policy "Own daily words visible to submitter"
  on public.daily_words for select
  to authenticated
  using (submitted_by = auth.uid());

-- Editors can view ALL daily words (all fields)
create policy "Editors can view all daily words"
  on public.daily_words for select
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'editor'
    )
  );

-- All authenticated users can read today's scheduled or used word
-- (actual word hidden via the secure view — this policy enables the row to be visible)
create policy "Today's daily word visible to all"
  on public.daily_words for select
  to authenticated
  using (
    scheduled_date = current_date
    and status in ('scheduled', 'used')
  );

-- WordMasters and Editors can insert daily words
create policy "WordMasters can submit daily words"
  on public.daily_words for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.users
      where id = auth.uid() and role in ('wordmaster', 'editor')
    )
  );

-- WordMasters can update their own pending/scheduled words
create policy "WordMasters can update own pending words"
  on public.daily_words for update
  to authenticated
  using (
    submitted_by = auth.uid()
    and status in ('pending', 'scheduled')
  )
  with check (
    submitted_by = auth.uid()
  );

-- Editors can update any daily word (for scheduling, status changes)
create policy "Editors can update any daily word"
  on public.daily_words for update
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================================
-- 4. Secure view: daily_words_calendar
-- Hides word/definition from non-owners/non-editors,
-- except for used words and today's definition (needed for gameplay).
-- ============================================================
create or replace view public.daily_words_calendar as
select
  dw.id,
  dw.scheduled_date,
  dw.status,
  dw.word_length,
  dw.created_at,
  dw.submitted_by,
  u.username as submitted_by_username,
  u.display_name as submitted_by_display_name,
  -- Word: only visible to submitter, editors, or if status = 'used'
  case
    when dw.submitted_by = auth.uid() then dw.word
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.word
    when dw.status = 'used' then dw.word
    else null
  end as word,
  -- Definition: visible to submitter, editors, used words, OR today's scheduled word (gameplay clue)
  case
    when dw.submitted_by = auth.uid() then dw.definition
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.definition
    when dw.status = 'used' then dw.definition
    when dw.scheduled_date = current_date and dw.status = 'scheduled' then dw.definition
    else null
  end as definition,
  -- Part of speech: same visibility as definition
  case
    when dw.submitted_by = auth.uid() then dw.part_of_speech
    when exists (select 1 from public.users where id = auth.uid() and role = 'editor') then dw.part_of_speech
    when dw.status = 'used' then dw.part_of_speech
    when dw.scheduled_date = current_date and dw.status = 'scheduled' then dw.part_of_speech
    else null
  end as part_of_speech
from public.daily_words dw
join public.users u on u.id = dw.submitted_by;

-- Grant access to the view for authenticated users
grant select on public.daily_words_calendar to authenticated;
