-- ============================================================
-- Migration 024: Offline definitions for House word import
-- ============================================================
-- The live dictionaries can't keep up with bulk import: dictionaryapi.dev has
-- been down for days, and Wiktionary throttles Supabase's shared egress IPs
-- after a handful of lookups. Load WordNet 3.1 definitions once and suggest
-- straight from the database instead — no per-word network calls.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR, then import
-- supabase/seed/word_definitions.csv into public.word_definitions with the
-- Table Editor's "Import data from CSV" (~41k rows, header row included).
--
-- WordNet 3.1 (c) Princeton University, used under the WordNet License:
-- https://wordnet.princeton.edu/license-and-commercial-use
-- ============================================================

-- Up to 3 senses per 4-8 letter lemma that is also in word_frequency.
-- sense_rank 1 is the most common sense. Base forms only: WordNet has no
-- plurals / past tenses, which is what keeps inflections out of suggestions.
create table public.word_definitions (
  word            text not null,       -- lowercase, matches word_frequency
  sense_rank      smallint not null,
  part_of_speech  text not null,
  definition      text not null,
  primary key (word, sense_rank)
);

-- Reference data only (service role). RLS on with no policy.
alter table public.word_definitions enable row level security;

-- ---- Suggestions now come with their definitions ----
-- Return type changes, so drop and recreate. Only words WordNet defines are
-- offered; the inflection filter from 023 is no longer needed.
drop function if exists public.suggest_house_candidates(real, real, int);

create function public.suggest_house_candidates(
  p_min_zipf real,
  p_max_zipf real,
  p_limit int default 20
)
returns table (word text, zipf real, senses jsonb)
language sql
security definer
set search_path = public
as $$
  select
    w.word,
    w.zipf,
    (
      select jsonb_agg(
        jsonb_build_object('part_of_speech', d.part_of_speech, 'definition', d.definition)
        order by d.sense_rank
      )
      from word_definitions d
      where d.word = w.word
    ) as senses
  from word_frequency w
  where w.zipf between p_min_zipf and p_max_zipf
    and w.word ~ '^[a-z]{4,8}$'
    and exists (select 1 from word_definitions d where d.word = w.word)
    and not exists (select 1 from daily_words dw where dw.word = upper(w.word))
    and not exists (select 1 from house_word_rejects r where r.word = upper(w.word))
  order by random()
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.suggest_house_candidates(real, real, int) from public, anon, authenticated;
grant execute on function public.suggest_house_candidates(real, real, int) to service_role;
