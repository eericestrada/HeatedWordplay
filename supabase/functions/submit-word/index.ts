// Supabase Edge Function: submit-word
//
// Client sends: { word, definition, part_of_speech, clue?, inspo, shares? }
// Server validates against dictionary API, calculates complexity, creates puzzle.
//
// Uses dictionaryapi.dev for dictionary validation in production.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

function calcComplexity(word: string): number {
  return word
    .toUpperCase()
    .split("")
    .reduce((sum, ch) => sum + (LETTER_VALUES[ch] || 0), 0);
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
    if (!lookup.valid) {
      return new Response(
        JSON.stringify({ error: "Word not found in dictionary" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate that the provided definition matches one from the dictionary
    // (loose check — user picked it from the list)
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

    const complexity = calcComplexity(upperWord);

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
        complexity,
        is_public: !!is_public,
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
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
