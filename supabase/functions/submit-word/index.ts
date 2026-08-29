// Supabase Edge Function: submit-word
//
// Client sends: { word, definition, part_of_speech, clue?, inspo, shares? }
// Server validates against dictionary API, calculates complexity, creates puzzle.
//
// Uses dictionaryapi.dev for dictionary validation in production.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Difficulty scoring v1 (see migration 009 + difficulty-scoring-spec.md) ──
// difficulty = BASE + rarity + trickiness, computed server-side from the
// word_frequency table. Stored in puzzles.complexity; the per-component
// breakdown is stored in puzzles.difficulty_breakdown (jsonb). Words operate
// in lowercase because the word_frequency seed is lowercase.

const COMMON_LETTERS = new Set("etaoinsr".split(""));
const TOP_COMMON = new Set("etaoinshrdlu".split(""));
const WEIRD_ONSETS = ["fj", "sv", "ts", "zh", "cz", "sz", "pf", "kv", "gn", "kn", "ps", "mn", "vl", "wr"];
const RARE_LETTERS = new Set("jqxz".split(""));
const VOWELS = new Set("aeiou".split(""));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function repeatTerm(w: string): number {
  const counts: Record<string, number> = {};
  for (const ch of w) counts[ch] = (counts[ch] || 0) + 1;
  let pts = 0;
  for (const ch in counts) {
    if (counts[ch] > 1) pts += (counts[ch] - 1) * (COMMON_LETTERS.has(ch) ? 2.5 : 1.5);
  }
  return pts;
}

function flowTerm(w: string): number {
  let pts = 0;
  if (WEIRD_ONSETS.includes(w.slice(0, 2))) pts += 3;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i], b = w[i + 1];
    if ((RARE_LETTERS.has(a) && !VOWELS.has(b)) || (RARE_LETTERS.has(b) && !VOWELS.has(a))) pts += 2;
  }
  const vowels = [...w].filter((c) => VOWELS.has(c)).length;
  if (w.length >= 5 && vowels <= 1) pts += 3;
  return Math.min(4, pts);
}

function letterEase(w: string): number {
  const distinct = new Set(w.split(""));
  let common = 0;
  for (const ch of distinct) if (TOP_COMMON.has(ch)) common++;
  return distinct.size ? common / distinct.size : 0;
}

function suffixStems(w: string): string[] {
  const sufs: [string, string][] = [
    ["ies", "y"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""],
    ["er", "e"], ["er", ""], ["ly", ""], ["s", ""], ["d", ""],
  ];
  const out: string[] = [];
  for (const [suf, rep] of sufs) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) out.push(w.slice(0, w.length - suf.length) + rep);
  }
  return [...new Set(out)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rarityOf(admin: any, w: string): Promise<{ rarity: number; zipf: number | null }> {
  try {
    const { data } = await admin.from("word_frequency").select("zipf").eq("word", w).maybeSingle();
    let zipf: number | null = data?.zipf ?? null;
    if (zipf == null) {
      const stems = suffixStems(w);
      if (stems.length) {
        const { data: d2 } = await admin
          .from("word_frequency").select("zipf").in("word", stems)
          .order("zipf", { ascending: false }).limit(1);
        if (d2 && d2.length) zipf = d2[0].zipf;
      }
    }
    if (zipf == null) return { rarity: 18, zipf: null };
    return { rarity: Math.max(0, Math.min(18, Math.round((5 - zipf) * 4))), zipf };
  } catch (_e) {
    return { rarity: 0, zipf: null }; // table missing / query error — don't mint a phantom nightmare
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function neighborhood(admin: any, w: string): Promise<{ concentrated: number; spread: number; maxCohort: number }> {
  try {
    const cands = new Set<string>();
    for (let i = 0; i < w.length; i++) {
      for (let cc = 97; cc <= 122; cc++) {
        const ch = String.fromCharCode(cc);
        if (ch === w[i]) continue;
        cands.add(w.slice(0, i) + ch + w.slice(i + 1));
      }
    }
    const { data } = await admin.from("word_frequency").select("word").in("word", [...cands]).gte("zipf", 2.5);
    const perPos = new Array(w.length).fill(0);
    let total = 0;
    for (const row of (data || [])) {
      let pos = -1;
      for (let i = 0; i < w.length; i++) { if (row.word[i] !== w[i]) { pos = i; break; } }
      if (pos >= 0) { perPos[pos]++; total++; }
    }
    const maxCohort = w.length ? Math.max(...perPos) : 0;
    return {
      concentrated: Math.min(8, Math.max(0, maxCohort - 3) * 1.6),
      spread: Math.min(4, (total - maxCohort) * 0.5),
      maxCohort,
    };
  } catch (_e) {
    return { concentrated: 0, spread: 0, maxCohort: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeDifficulty(admin: any, upperWord: string): Promise<{ difficulty: number; breakdown: Record<string, unknown> }> {
  const w = upperWord.toLowerCase();
  const BASE = 5;
  const rep = repeatTerm(w);
  const len = Math.max(0, 8 - w.length) * 0.6;
  const flow = flowTerm(w);
  const ease = letterEase(w);
  const { rarity, zipf } = await rarityOf(admin, w);
  const { concentrated, spread, maxCohort } = await neighborhood(admin, w);
  const locate = len + flow + spread;
  const trick = rep + concentrated + locate * (1 - 0.6 * ease); // letterEase discounts locate, not repeats/cohort
  const difficulty = Math.round(BASE + rarity + trick);
  const tier =
    difficulty <= 13 ? "cake" : difficulty <= 16 ? "easy" : difficulty <= 19 ? "medium" : difficulty <= 25 ? "hard" : "nightmare";
  const breakdown = {
    base: BASE, rarity, repeat: r1(rep), length: r1(len), flow,
    concentrated: r1(concentrated), spread: r1(spread), letter_ease: r2(ease),
    max_cohort: maxCohort, zipf: zipf != null ? r2(zipf) : null, tier,
  };
  return { difficulty, breakdown };
}

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: Array<{ definition: string }>;
}

interface DictionaryResponse {
  word: string;
  meanings: DictionaryMeaning[];
}

interface ShareTarget {
  share_type: "group" | "user";
  target_id: string;
  allow_reshare: boolean;
}

// A healthy dictionaryapi.dev answers in well under a second. Its current
// failure mode is slow, not flaky: the origin is unreachable, so Cloudflare
// hangs for ~20s and returns a 522. Retrying a service in that state just
// multiplies the wait, so the primary gets one short attempt and anything
// other than a clean answer falls through to Wiktionary.
const PRIMARY_TIMEOUT_MS = 3000;
// Once the primary is down, every lookup would otherwise pay the full timeout
// before falling back — a 3s tax on each guess for the length of an outage.
// Skip it briefly after a failure instead; the window expiring re-probes it, so
// this self-heals when the service comes back.
const PRIMARY_COOLDOWN_MS = 60_000;
let primaryDownUntil = 0;
const FALLBACK_ATTEMPTS = 2;
const FALLBACK_TIMEOUT_MS = 4000;
const WIKTIONARY_UA = "HeatedWordplay/1.0 (word game dictionary lookup)";

type LookupResult =
  | { status: "valid"; meanings?: DictionaryMeaning[] }
  | { status: "invalid" }
  | { status: "unavailable" };

// Primary source. A 404 is authoritative: no such word. Anything else (5xx,
// 429, network, timeout) is reported as "unavailable" so the caller can fall
// back instead of treating an outage as a verdict on the word.
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

// Wiktionary returns definitions as HTML fragments (wikilinks, inflection
// markup, formatting). Strip it so definitions compare against what the client
// sent, which came through the same cleanup.
function stripHtml(html: string): string {
  return html
    // Some entries embed a <style> block for inline templates; dropping only
    // the tags would leave the CSS itself sitting in the definition text.
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
    // Wiktionary capitalises these ("Noun"); dictionaryapi.dev doesn't.
    const partOfSpeech = String(group?.partOfSpeech || "").toLowerCase();
    const definitions: Array<{ definition: string }> = [];
    for (const def of group?.definitions || []) {
      const definition = stripHtml(String(def?.definition || ""));
      // Some entries carry an empty definition body (a bare inflection header).
      if (!definition) continue;
      definitions.push({ definition });
    }
    if (definitions.length > 0) meanings.push({ partOfSpeech, definitions });
  }
  return meanings;
}

// Fallback source. dictionaryapi.dev is itself built from Wiktionary data, so
// this reaches the same corpus through infrastructure that isn't down — which
// also makes a 404 here trustworthy.
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
        // Page exists but has no English section — a word in another language.
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

// Tries dictionaryapi.dev first, Wiktionary second. Only a verdict ends the
// search; "unavailable" means neither provider answered.
async function lookupWord(word: string): Promise<LookupResult> {
  const primary = await lookupPrimary(word);
  if (primary.status !== "unavailable") return primary;
  return await lookupFallback(word);
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { word, definition, part_of_speech, clue, inspo, is_public, shares } =
      await req.json();

    // Validate input
    const upperWord = (word || "").toUpperCase().trim();
    if (upperWord.length < 4 || upperWord.length > 8) {
      return new Response(
        JSON.stringify({ error: "Word must be 4-8 letters" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!/^[A-Z]+$/.test(upperWord)) {
      return new Response(
        JSON.stringify({ error: "Word must contain only letters" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!definition || !part_of_speech) {
      return new Response(
        JSON.stringify({ error: "Definition and part of speech required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!inspo || inspo.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Inspo is required (min 3 characters)" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (clue && clue.length > 100) {
      return new Response(
        JSON.stringify({ error: "Clue must be 100 characters or less" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (inspo.length > 200) {
      return new Response(
        JSON.stringify({ error: "Inspo must be 200 characters or less" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate word exists in dictionary
    const lookup = await lookupWord(upperWord);
    if (lookup.status === "invalid") {
      return new Response(
        JSON.stringify({ error: "Word not found in dictionary" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (lookup.status === "unavailable") {
      // Fail open. The client only reaches this point after its own successful
      // lookup produced the definition and part of speech it just sent, so the
      // word was verified moments ago. Blocking here would reject a real word
      // because of an upstream outage.
      console.warn(
        `Dictionary unavailable while validating ${upperWord} — accepting on client-supplied definition`,
      );
    }

    // Validate that the provided definition matches one from the dictionary
    // (loose check — user picked it from the list). Skipped when the lookup
    // never returned, since there's nothing to compare against.
    if (lookup.status === "valid") {
      const allDefs = (lookup.meanings || []).flatMap((m) =>
        m.definitions.map((d) => d.definition),
      );
      const defMatch = allDefs.some(
        (d) => d.toLowerCase().trim() === definition.toLowerCase().trim(),
      );
      if (!defMatch) {
        // Allow it anyway — the user may have slightly edited, or the API
        // might return different text. Log a warning but don't block.
        console.warn(
          `Definition mismatch for ${upperWord}: "${definition}" not found in API results`,
        );
      }
    }

    // Check whether this user has already submitted this word before
    const { data: priorPuzzles } = await supabaseAdmin
      .from("puzzles")
      .select("created_at")
      .eq("creator_id", user.id)
      .eq("word", upperWord)
      .order("created_at", { ascending: true })
      .limit(1);

    if (priorPuzzles && priorPuzzles.length > 0) {
      const submittedOn = new Date(priorPuzzles[0].created_at).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "long", day: "numeric" },
      );
      return new Response(
        JSON.stringify({
          error: `Sorry, but you've already submitted this word before on ${submittedOn}.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    const { difficulty, breakdown } = await computeDifficulty(supabaseAdmin, upperWord);

    // Create the puzzle
    const { data: puzzle, error: puzzleError } = await supabaseAdmin
      .from("puzzles")
      .insert({
        creator_id: user.id,
        word: upperWord,
        definition: definition.trim(),
        part_of_speech: part_of_speech.trim(),
        clue: clue?.trim() || null,
        inspo: inspo.trim(),
        complexity: difficulty,
        is_public: !!is_public,
        difficulty_breakdown: breakdown,
      })
      .select()
      .single();

    if (puzzleError) {
      console.error("Failed to create puzzle:", puzzleError);
      return new Response(
        JSON.stringify({ error: "Failed to create puzzle" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create shares if provided
    if (shares && Array.isArray(shares) && shares.length > 0) {
      const shareRows = (shares as ShareTarget[]).map((s) => ({
        puzzle_id: puzzle.id,
        share_type: s.share_type,
        target_id: s.target_id,
        shared_by: user.id,
        allow_reshare: s.allow_reshare ?? false,
      }));

      const { error: shareError } = await supabaseAdmin
        .from("puzzle_shares")
        .insert(shareRows);

      if (shareError) {
        console.error("Failed to create shares:", shareError);
        // Don't fail the whole request — puzzle was created
      }
    }

    // Auto-create attempt for own puzzle (marked as own, score 0)
    const { error: attemptError } = await supabaseAdmin
      .from("attempts")
      .insert({
        puzzle_id: puzzle.id,
        user_id: user.id,
        total_guesses: 0,
        medal: null,
        score: 0,
        used_clue: false,
        magnets_used: 0,
        is_own_puzzle: true,
      });

    if (attemptError) {
      console.error("Failed to auto-create own attempt:", attemptError);
    }

    return new Response(
      JSON.stringify({
        puzzle: {
          id: puzzle.id,
          word: puzzle.word,
          complexity: puzzle.complexity,
          difficulty_breakdown: puzzle.difficulty_breakdown,
          created_at: puzzle.created_at,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    console.error("submit-word error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      },
    );
  }
});
