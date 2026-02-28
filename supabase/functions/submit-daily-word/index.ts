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

async function lookupWord(
  word: string,
): Promise<{ valid: boolean; meanings?: DictionaryMeaning[] }> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`,
    );
    if (!res.ok) {
      return { valid: false };
    }
    const data: DictionaryResponse[] = await res.json();
    if (!data || data.length === 0) {
      return { valid: false };
    }
    return { valid: true, meanings: data[0].meanings };
  } catch {
    return { valid: false };
  }
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
    if (!lookup.valid) {
      return new Response(
        JSON.stringify({ error: "Word not found in dictionary" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Validate definition matches one from dictionary (loose check)
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
