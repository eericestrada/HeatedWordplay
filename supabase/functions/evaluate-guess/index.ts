// Supabase Edge Function: evaluate-guess
//
// Client sends: { puzzle_id, guess_cells: [{letter, position}...], used_clue, magnets_used }
// Server responds: { result: [{letter, status, position}...], game_over, solved, medal, score, attempt }
//
// The answer word NEVER leaves the server until the game is complete.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const MAX_GUESSES = 6;

interface GuessCell {
  letter: string;
  position: number;
}

interface ResultCell {
  letter: string;
  status: "correct" | "present" | "absent" | null;
  position: number;
}

function evaluateCells(cells: GuessCell[], answer: string): ResultCell[] {
  const answerLetters = answer.split("");
  const wordLength = answer.length;

  // Build result array for full word length
  const result: ResultCell[] = [];
  for (let i = 0; i < wordLength; i++) {
    const cell = cells.find((c) => c.position === i);
    if (cell && cell.letter) {
      result.push({ letter: cell.letter, status: "absent", position: i });
    } else {
      result.push({ letter: "", status: null, position: i });
    }
  }

  // Budget-based evaluation (Wordle standard)
  const letterBudget: Record<string, number> = {};
  answerLetters.forEach((ch) => {
    letterBudget[ch] = (letterBudget[ch] || 0) + 1;
  });

  // First pass: correct positions
  for (let i = 0; i < wordLength; i++) {
    if (result[i].letter && result[i].letter === answerLetters[i]) {
      result[i].status = "correct";
      letterBudget[result[i].letter]--;
    }
  }

  // Second pass: present letters
  for (let i = 0; i < wordLength; i++) {
    if (!result[i].letter || result[i].status === "correct") continue;
    const ch = result[i].letter;
    if (letterBudget[ch] && letterBudget[ch] > 0) {
      result[i].status = "present";
      letterBudget[ch]--;
    }
  }

  return result;
}

function getMedal(guessCount: number, solved: boolean): string | null {
  if (!solved) return null;
  if (guessCount <= 2) return "gold";
  if (guessCount <= 4) return "silver";
  return "bronze";
}

function getMultiplier(medal: string | null): number {
  if (medal === "gold") return 3;
  if (medal === "silver") return 2;
  if (medal === "bronze") return 1;
  return 0;
}

Deno.serve(async (req: Request) => {
  // CORS headers
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

    // Create client with user's JWT for auth, and service_role for DB access
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get the authenticated user
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

    const { puzzle_id, guess_cells, used_clue, magnets_used, guess_number, is_daily } =
      await req.json();

    if (!puzzle_id || !guess_cells) {
      return new Response(
        JSON.stringify({ error: "Missing puzzle_id or guess_cells" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
      );
    }

    // ---- Fetch the answer word (from daily_words or puzzles) ----
    let answerWord: string;
    let answerDefinition: string;
    let answerClue: string | null = null;
    let answerInspo: string | null = null;
    let creatorId: string | null = null;
    let puzzleComplexity = 0;

    if (is_daily) {
      // Daily Heat: fetch from daily_words table
      const { data: dailyWord, error: dwError } = await supabaseAdmin
        .from("daily_words")
        .select("word, definition, submitted_by")
        .eq("id", puzzle_id)
        .single();

      if (dwError || !dailyWord) {
        return new Response(JSON.stringify({ error: "Daily word not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      answerWord = dailyWord.word;
      answerDefinition = dailyWord.definition;
      // Daily puzzles have no clue, inspo, or scoring
    } else {
      // Friendly: fetch from puzzles table
      const { data: puzzle, error: puzzleError } = await supabaseAdmin
        .from("puzzles")
        .select("*")
        .eq("id", puzzle_id)
        .single();

      if (puzzleError || !puzzle) {
        return new Response(JSON.stringify({ error: "Puzzle not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Check if user already has an attempt (completed game)
      const { data: existingAttempt } = await supabaseAdmin
        .from("attempts")
        .select("id")
        .eq("puzzle_id", puzzle_id)
        .eq("user_id", user.id)
        .single();

      if (existingAttempt) {
        return new Response(
          JSON.stringify({ error: "Already completed this puzzle" }),
          { status: 409, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
        );
      }

      answerWord = puzzle.word;
      answerDefinition = puzzle.definition;
      answerClue = puzzle.clue;
      answerInspo = puzzle.inspo;
      creatorId = puzzle.creator_id;
      puzzleComplexity = puzzle.complexity;
    }

    // Evaluate the guess
    const result = evaluateCells(guess_cells, answerWord);
    const guessWord = guess_cells
      .sort((a: GuessCell, b: GuessCell) => a.position - b.position)
      .map((c: GuessCell) => c.letter)
      .join("");
    const isFull = guess_cells.length === answerWord.length;
    const solved = isFull && guessWord === answerWord;

    const responseData: Record<string, unknown> = {
      result,
      solved,
    };

    const guessNum = guess_number ? parseInt(String(guess_number)) : 0;
    if (solved || guessNum >= MAX_GUESSES) {
      const guessNumber = guessNum || MAX_GUESSES;
      responseData.game_over = true;

      if (is_daily) {
        // Daily mode: no attempt record, no scoring. Just reveal the answer.
        responseData.word = answerWord;
        responseData.definition = answerDefinition;

        // Mark the daily word as used (idempotent)
        await supabaseAdmin
          .from("daily_words")
          .update({ status: "used" })
          .eq("id", puzzle_id)
          .eq("status", "scheduled");
      } else {
        // Friendly mode: create attempt record with scoring
        const isOwnPuzzle = creatorId === user.id;
        const medal = getMedal(guessNumber, solved);
        const multiplier = getMultiplier(medal);
        const cluePenalty = used_clue ? 0.5 : 1.0;
        const magnetPenalty =
          magnets_used === 0 ? 1 : magnets_used === 1 ? 0.75 : 0.25;
        const score = isOwnPuzzle
          ? 0
          : Math.round(puzzleComplexity * multiplier * cluePenalty * magnetPenalty);

        const { data: attempt, error: attemptError } = await supabaseAdmin
          .from("attempts")
          .insert({
            puzzle_id,
            user_id: user.id,
            total_guesses: guessNumber,
            medal: isOwnPuzzle ? null : medal,
            score,
            used_clue: !!used_clue,
            magnets_used: magnets_used || 0,
            is_own_puzzle: isOwnPuzzle,
          })
          .select()
          .single();

        if (attemptError) {
          console.error("Failed to create attempt:", attemptError);
        }

        responseData.medal = isOwnPuzzle ? null : medal;
        responseData.score = score;
        responseData.is_own_puzzle = isOwnPuzzle;
        responseData.attempt = attempt;

        // Reveal the answer
        responseData.word = answerWord;
        responseData.definition = answerDefinition;
        responseData.clue = answerClue;
        responseData.inspo = answerInspo;
      }
    } else {
      responseData.game_over = false;
    }

    // If puzzle has a clue and user requested it, send just the clue text
    if (!is_daily && used_clue && answerClue) {
      responseData.clue_text = answerClue;
    }

    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("evaluate-guess error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      },
    );
  }
});
