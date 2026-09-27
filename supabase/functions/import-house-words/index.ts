// Supabase Edge Function: import-house-words
//
// Editor-only tools for the House reserve — the pool of vetted words the
// scheduler draws from when no one has scheduled a Daily.
//
// Client sends one of:
//   { action: "suggest", min_difficulty, max_difficulty, count? }
//       -> { candidates, skipped }  random frequency-list words in the range
//   { action: "preview", words: string[] }
//       -> { candidates, skipped }  the editor's own pasted words
//   { action: "accept", word, definition, part_of_speech, difficulty? }
//       -> { id }                   adds the word to the reserve
//   { action: "reject", word }      -> { ok }  never suggest it again
//   { action: "fill", days?, generate? } -> { filled }  fill empty days now:
//       days = N fills empty days in the next N (default 3); "all" keeps going
//       until the reserve runs out. generate = true lets the database auto-pick
//       words if the reserve is dry (used by swap); editor fills don't.
//   { action: "discard", id }       -> { ok }  delete an unplayed House word
//       and never pick it again (for bad auto-picks)
//
// Candidates are only looked up, never stored — nothing reaches the reserve
// without an explicit accept.
//
// Definitions come from the word_definitions table (WordNet, loaded once —
// migration 024). The live dictionaries are only a fallback for pasted words
// WordNet doesn't know: they can't keep up with bulk lookups (dictionaryapi.dev
// outages, Wiktionary throttling Supabase's shared egress IPs).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: Array<{ definition: string }>;
}

interface DictionaryResponse {
  word: string;
  meanings: DictionaryMeaning[];
}

// Dictionary lookup — same two-provider strategy as submit-daily-word; see
// the comments there for the timeout and cooldown reasoning.
const PRIMARY_TIMEOUT_MS = 3000;
const PRIMARY_COOLDOWN_MS = 60_000;
let primaryDownUntil = 0;
const FALLBACK_ATTEMPTS = 2;
const FALLBACK_TIMEOUT_MS = 4000;
const WIKTIONARY_UA = "HeatedWordplay/1.0 (word game dictionary lookup)";

type LookupResult =
  | { status: "valid"; meanings?: DictionaryMeaning[] }
  | { status: "invalid" }
  | { status: "unavailable" };

async function lookupPrimary(word: string): Promise<LookupResult> {
  if (Date.now() < primaryDownUntil) return { status: "unavailable" };

  const url =
    `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PRIMARY_TIMEOUT_MS),
    });

    if (res.status === 404) {
      primaryDownUntil = 0;
      return { status: "invalid" };
    }

    if (res.ok) {
      const data: DictionaryResponse[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        primaryDownUntil = 0;
        return { status: "valid", meanings: data[0].meanings };
      }
    }
  } catch {
    // Network error, timeout, or malformed JSON — all transient.
  }

  primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
  return { status: "unavailable" };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWiktionaryMeanings(data: unknown): DictionaryMeaning[] {
  const meanings: DictionaryMeaning[] = [];
  const english = (data as { en?: unknown })?.en;
  if (!Array.isArray(english)) return meanings;
  for (const group of english) {
    const partOfSpeech = String(group?.partOfSpeech || "").toLowerCase();
    const definitions: Array<{ definition: string }> = [];
    for (const def of group?.definitions || []) {
      const definition = stripHtml(String(def?.definition || ""));
      if (!definition) continue;
      definitions.push({ definition });
    }
    if (definitions.length > 0) meanings.push({ partOfSpeech, definitions });
  }
  return meanings;
}

async function lookupFallback(word: string): Promise<LookupResult> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${
    encodeURIComponent(word.toLowerCase())
  }`;

  for (let attempt = 1; attempt <= FALLBACK_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": WIKTIONARY_UA },
        signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
      });

      if (res.status === 404) return { status: "invalid" };

      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray((data as { en?: unknown })?.en)) {
          return { status: "invalid" };
        }
        const meanings = parseWiktionaryMeanings(data);
        if (meanings.length > 0) return { status: "valid", meanings };
        if (attempt === FALLBACK_ATTEMPTS) return { status: "unavailable" };
      } else if (attempt === FALLBACK_ATTEMPTS) {
        return { status: "unavailable" };
      }
    } catch {
      if (attempt === FALLBACK_ATTEMPTS) return { status: "unavailable" };
    }

    await new Promise((r) =>
      setTimeout(r, 250 * 2 ** (attempt - 1) + Math.random() * 125)
    );
  }

  return { status: "unavailable" };
}

async function lookupWord(word: string): Promise<LookupResult> {
  const primary = await lookupPrimary(word);
  if (primary.status !== "unavailable") return primary;
  return await lookupFallback(word);
}

// ---- Difficulty scale ----
// Editors think in 1 (very common) .. 10 (very rare). The frequency list is in
// zipf (log10 occurrences per billion words): ~5 is "garden"-common, ~1.5 is
// obscure. Map linearly between those; each integer step covers +/- 0.5.
const ZIPF_AT_1 = 5.0;
const ZIPF_AT_10 = 1.5;
const ZIPF_PER_STEP = (ZIPF_AT_1 - ZIPF_AT_10) / 9;

function zipfForDifficulty(d: number): number {
  return ZIPF_AT_1 - (d - 1) * ZIPF_PER_STEP;
}

function difficultyForZipf(z: number): number {
  return Math.max(1, Math.min(10, Math.round(1 + (ZIPF_AT_1 - z) / ZIPF_PER_STEP)));
}

// ---- Definition picking ----
// Proper nouns and inflection stubs ("plural of X") make terrible Dailies.
const SKIP_POS = new Set(["proper noun", "abbreviation", "symbol", "letter", "prefix", "suffix"]);
const INFLECTION_RE =
  /^(\(.*?\)\s*)?(plural|simple past|past tense|past participle|present participle|third-person|alternative (form|spelling)|obsolete (form|spelling)|misspelling|archaic (form|spelling)|nonstandard|eye dialect|comparative|superlative)\b.*\bof\b/i;

interface Sense {
  part_of_speech: string;
  definition: string;
}

interface Candidate {
  word: string;
  part_of_speech: string;
  definition: string;
  difficulty: number | null;
  /** Every known sense, most common first, so the editor can pick another */
  senses?: Sense[];
}

// WordNet senses for the given words, keyed by UPPERCASE word.
async function offlineSenses(admin: SupabaseClient, words: string[]): Promise<Map<string, Sense[]>> {
  const out = new Map<string, Sense[]>();
  if (words.length === 0) return out;
  const { data, error } = await admin
    .from("word_definitions")
    .select("word, sense_rank, part_of_speech, definition")
    .in("word", words.map((w) => w.toLowerCase()))
    .order("sense_rank");
  if (error) {
    console.error("word_definitions lookup failed:", error);
    return out;
  }
  for (const r of data || []) {
    const key = String(r.word).toUpperCase();
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push({ part_of_speech: r.part_of_speech, definition: r.definition });
  }
  return out;
}

function fromSenses(word: string, senses: Sense[], difficulty: number | null): Candidate {
  return { word, ...senses[0], difficulty, senses };
}

type Checked =
  | { ok: true; candidate: Candidate }
  | { ok: false; word: string; reason: string };

async function checkWord(word: string, difficulty: number | null): Promise<Checked> {
  const lookup = await lookupWord(word);
  if (lookup.status === "invalid") return { ok: false, word, reason: "not in dictionary" };
  if (lookup.status === "unavailable") return { ok: false, word, reason: "dictionary unavailable" };

  for (const m of lookup.meanings || []) {
    const pos = (m.partOfSpeech || "").toLowerCase();
    if (!pos || SKIP_POS.has(pos)) continue;
    const def = m.definitions.find((d) => d.definition && !INFLECTION_RE.test(d.definition));
    if (def) {
      return {
        ok: true,
        candidate: { word, part_of_speech: pos, definition: def.definition, difficulty },
      };
    }
  }
  return { ok: false, word, reason: "no usable definition" };
}

// Look words up a few at a time until `want` pass (or the list runs out).
// Kept gentle: when dictionaryapi.dev is down every lookup lands on
// Wiktionary, which starts answering 429 after a dozen or so quick requests.
// Once it throttles, stop and return what we have — nothing is consumed by a
// failed lookup, so the editor can simply ask again in a moment.
const CONCURRENCY = 3;

async function collect(
  words: Array<{ word: string; difficulty: number | null }>,
  want: number,
): Promise<{ candidates: Candidate[]; skipped: Array<{ word: string; reason: string }>; throttled: boolean }> {
  const candidates: Candidate[] = [];
  const skipped: Array<{ word: string; reason: string }> = [];
  let throttled = false;
  for (let i = 0; i < words.length && candidates.length < want; i += CONCURRENCY) {
    const batch = words.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((w) => checkWord(w.word, w.difficulty)));
    let unavailable = 0;
    for (const r of results) {
      if (r.ok) {
        if (candidates.length < want) candidates.push(r.candidate);
      } else if (r.reason === "dictionary unavailable") {
        unavailable++;
      } else {
        skipped.push({ word: r.word, reason: r.reason });
      }
    }
    if (unavailable >= 2) {
      throttled = true;
      break;
    }
  }
  return { candidates, skipped, throttled };
}

// Words already in the pool (any source/status) or previously rejected.
async function existingWords(admin: SupabaseClient, words: string[]): Promise<Map<string, string>> {
  const taken = new Map<string, string>();
  if (words.length === 0) return taken;
  const [{ data: pool }, { data: rejects }] = await Promise.all([
    admin.from("daily_words").select("word").in("word", words),
    admin.from("house_word_rejects").select("word").in("word", words),
  ]);
  for (const r of pool || []) taken.set(r.word, "already in the pool");
  for (const r of rejects || []) if (!taken.has(r.word)) taken.set(r.word, "previously rejected");
  return taken;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const WORD_RE = /^[A-Z]{4,8}$/;
const MAX_SUGGEST = 30;
const MAX_PASTE = 60;
const MAX_FILL_DAYS = 3650;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth header" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "editor") {
      return json({ error: "Only Editors can manage the House reserve" }, 403);
    }

    const body = await req.json();

    switch (body?.action) {
      case "suggest": {
        const minD = Math.max(1, Math.min(10, Math.round(Number(body.min_difficulty) || 6)));
        const maxD = Math.max(minD, Math.min(10, Math.round(Number(body.max_difficulty) || 8)));
        const count = Math.max(1, Math.min(MAX_SUGGEST, Math.round(Number(body.count) || 20)));

        // Rarer end of the range = lower zipf. Every row already carries its
        // WordNet senses, so there's nothing to look up.
        const { data, error } = await admin.rpc("suggest_house_candidates", {
          p_min_zipf: zipfForDifficulty(maxD + 0.5),
          p_max_zipf: zipfForDifficulty(minD - 0.5),
          p_limit: count,
        });
        if (error) {
          console.error("suggest_house_candidates failed:", error);
          return json({ error: "Couldn't load candidate words" }, 500);
        }
        const candidates = (data || [])
          .filter((r: { senses: Sense[] | null }) => r.senses && r.senses.length > 0)
          .map((r: { word: string; zipf: number; senses: Sense[] }) =>
            fromSenses(r.word.toUpperCase(), r.senses, difficultyForZipf(r.zipf))
          );
        return json({ candidates, skipped: [] });
      }

      case "preview": {
        const raw: unknown[] = Array.isArray(body.words) ? body.words : [];
        const seen = new Set<string>();
        const skipped: Array<{ word: string; reason: string }> = [];
        const valid: string[] = [];
        for (const r of raw.slice(0, MAX_PASTE)) {
          const w = String(r || "").trim().toUpperCase();
          if (!w || seen.has(w)) continue;
          seen.add(w);
          if (!WORD_RE.test(w)) skipped.push({ word: w, reason: "must be 4-8 letters" });
          else valid.push(w);
        }

        const taken = await existingWords(admin, valid);
        const fresh = valid.filter((w) => {
          const reason = taken.get(w);
          if (reason) skipped.push({ word: w, reason });
          return !reason;
        });

        // Show the editor's own words' difficulty when the list knows them.
        const { data: freq } = await admin
          .from("word_frequency").select("word, zipf")
          .in("word", fresh.map((w) => w.toLowerCase()));
        const zipfOf = new Map((freq || []).map((f: { word: string; zipf: number }) => [f.word, f.zipf]));
        const difficultyOf = (w: string) => {
          const z = zipfOf.get(w.toLowerCase());
          return z == null ? null : difficultyForZipf(z);
        };

        // WordNet first; only words it doesn't know go to the live dictionaries.
        const offline = await offlineSenses(admin, fresh);
        const known = fresh
          .filter((w) => offline.has(w))
          .map((w) => fromSenses(w, offline.get(w)!, difficultyOf(w)));
        const unknown = fresh.filter((w) => !offline.has(w));

        const live = await collect(
          unknown.map((w) => ({ word: w, difficulty: difficultyOf(w) })),
          unknown.length,
        );
        const result = { ...live, candidates: [...known, ...live.candidates] };
        // Words the throttle cut off: tell the editor, so they can re-paste them.
        const reached = new Set([
          ...result.candidates.map((c) => c.word),
          ...result.skipped.map((s) => s.word),
        ]);
        const busy = result.throttled
          ? unknown.filter((w) => !reached.has(w)).map((word) => ({ word, reason: "dictionary busy, try again" }))
          : [];
        return json({
          candidates: result.candidates,
          skipped: [...skipped, ...result.skipped, ...busy],
          throttled: result.throttled,
        });
      }

      case "accept": {
        const word = String(body.word || "").trim().toUpperCase();
        const definition = String(body.definition || "").trim();
        const part_of_speech = String(body.part_of_speech || "").trim();
        if (!WORD_RE.test(word)) return json({ error: "Word must be 4-8 letters" }, 400);
        if (!definition) return json({ error: "Definition is required" }, 400);
        if (!part_of_speech) return json({ error: "Part of speech is required" }, 400);

        const { data, error } = await admin
          .from("daily_words")
          .insert({ word, definition, part_of_speech, source: "house", submitted_by: null })
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505") return json({ error: `${word} is already in the pool` }, 409);
          console.error("House insert failed:", error);
          return json({ error: "Failed to add word" }, 500);
        }
        // An editor may accept a word they once rejected (pasted by hand).
        await admin.from("house_word_rejects").delete().eq("word", word);
        return json({ id: data.id });
      }

      case "reject": {
        const word = String(body.word || "").trim().toUpperCase();
        if (!WORD_RE.test(word)) return json({ error: "Word must be 4-8 letters" }, 400);
        const { error } = await admin
          .from("house_word_rejects")
          .upsert({ word, rejected_by: user.id }, { onConflict: "word" });
        if (error) {
          console.error("Reject failed:", error);
          return json({ error: "Failed to reject word" }, 500);
        }
        return json({ ok: true });
      }

      case "fill": {
        // fill_daily_schedule stops on its own once the reserve is empty, so
        // "all" is just a horizon far enough out to never be the limit.
        const days = body.days === "all"
          ? MAX_FILL_DAYS
          : Math.max(1, Math.min(MAX_FILL_DAYS, Math.round(Number(body.days) || 3)));
        const { data, error } = await admin.rpc("fill_daily_schedule", {
          p_days: days,
          p_generate: body.generate === true,
        });
        if (error) {
          console.error("fill_daily_schedule failed:", error);
          return json({ error: "Failed to fill the schedule" }, 500);
        }
        return json({ filled: data ?? 0 });
      }

      case "discard": {
        const id = String(body.id || "");
        const { data: row } = await admin
          .from("daily_words").select("word, source, status").eq("id", id).maybeSingle();
        if (!row || row.source !== "house") return json({ error: "Not a House word" }, 404);
        if (row.status === "used") return json({ error: "Already played; can't discard" }, 409);

        await admin
          .from("house_word_rejects")
          .upsert({ word: row.word, rejected_by: user.id }, { onConflict: "word" });
        const { error } = await admin.from("daily_words").delete().eq("id", id).neq("status", "used");
        if (error) {
          console.error("Discard failed:", error);
          return json({ error: "Failed to discard word" }, 500);
        }
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("import-house-words error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
