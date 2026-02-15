// Supabase Edge Function: use-magnet
//
// Client sends: { puzzle_id, letter, current_grid: [{letter, position, pinned}...] }
// Server responds: { position: number } — the correct position for the letter
//
// This keeps the answer server-side while enabling the magnet power-up.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { puzzle_id, letter, current_grid } = await req.json();

    if (!puzzle_id || !letter) {
      return new Response(
        JSON.stringify({ error: "Missing puzzle_id or letter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch puzzle (server-side)
    const { data: puzzle, error: puzzleError } = await supabaseAdmin
      .from("puzzles")
      .select("word")
      .eq("id", puzzle_id)
      .single();

    if (puzzleError || !puzzle) {
      return new Response(JSON.stringify({ error: "Puzzle not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answerLetters = puzzle.word.split("");
    const upperLetter = letter.toUpperCase();

    // Find positions where this letter belongs in the answer
    const correctPositions: number[] = [];
    for (let i = 0; i < answerLetters.length; i++) {
      if (answerLetters[i] === upperLetter) {
        correctPositions.push(i);
      }
    }

    if (correctPositions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Letter not in answer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find first correct position that isn't already pinned with this letter
    const grid = current_grid || [];
    let targetPos: number | null = null;
    for (const pos of correctPositions) {
      const gridCell = grid.find(
        (c: { position: number; letter: string; pinned: boolean }) =>
          c.position === pos && c.letter === upperLetter && c.pinned,
      );
      if (!gridCell) {
        targetPos = pos;
        break;
      }
    }

    if (targetPos === null) {
      return new Response(
        JSON.stringify({ error: "Already placed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ position: targetPos, letter: upperLetter }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("use-magnet error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
