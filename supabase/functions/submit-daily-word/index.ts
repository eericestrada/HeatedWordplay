// Supabase Edge Function: submit-daily-word
//
// Client sends: { word, definition, part_of_speech }
// Server validates role, dictionary, duplicates, then inserts into daily_words.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: Array<{ definition: string }>;
}

interface DictionaryResponse {
  word: string;
  meanings: DictionaryMeaning[];
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Role check
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!["wordmaster", "editor"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Only WordMasters can submit daily words" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { word, definition, part_of_speech } = await req.json();

    // Validate input
    const upperWord = (word || "").toUpperCase().trim();
    if (upperWord.length < 4 || upperWord.length > 8) {
      return new Response(
        JSON.stringify({ error: "Word must be 4-8 letters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (!/^[A-Z]+$/.test(upperWord)) {
      return new Response(
        JSON.stringify({ error: "Word must contain only letters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (!definition || typeof definition !== "string" || !definition.trim()) {
      return new Response(
        JSON.stringify({ error: "Definition is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (!part_of_speech || typeof part_of_speech !== "string" || !part_of_speech.trim()) {
      return new Response(
        JSON.stringify({ error: "Part of speech is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Validate word exists in dictionary
    const lookup = await lookupWord(upperWord);
    if (lookup.status === "invalid") {
      return new Response(
        JSON.stringify({ error: "Word not found in dictionary" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (lookup.status === "unavailable") {
      // Fail open — the client already verified this word via its own lookup to
      // get the definition and part of speech it sent. An upstream outage
      // shouldn't reject a real word.
      console.warn(
        `Dictionary unavailable while validating ${upperWord} — accepting on client-supplied definition`,
      );
    }

    // Validate definition matches one from dictionary (loose check). Skipped
    // when the lookup never returned — nothing to compare against.
    if (lookup.status === "valid") {
      const allDefs = (lookup.meanings || []).flatMap((m) =>
        m.definitions.map((d) => d.definition),
      );
      const defMatch = allDefs.some(
        (d) => d.toLowerCase().trim() === definition.toLowerCase().trim(),
      );
      if (!defMatch) {
        console.warn(
          `Definition mismatch for ${upperWord}: "${definition}" not found in API results`,
        );
      }
    }

    // Check for duplicate word in pool
    const { data: existing } = await supabaseAdmin
      .from("daily_words")
      .select("id")
      .eq("word", upperWord)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({
          error: "This word is already in the Heat Pool and can't be added again",
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Insert into daily_words
    const { data: dailyWord, error: insertError } = await supabaseAdmin
      .from("daily_words")
      .insert({
        word: upperWord,
        definition: definition.trim(),
        part_of_speech: part_of_speech.trim(),
        submitted_by: user.id,
        status: "pending",
      })
      .select("id, word, status, created_at")
      .single();

    if (insertError) {
      // Handle unique constraint violation (race condition on duplicate)
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({
            error: "This word is already in the Heat Pool and can't be added again",
          }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
      console.error("Failed to insert daily word:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit word" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(JSON.stringify(dailyWord), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("submit-daily-word error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
