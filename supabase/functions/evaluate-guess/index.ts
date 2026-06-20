// Supabase Edge Function: evaluate-guess
//
// Client sends: { puzzle_id, guess_cells: [{letter, position}...], used_clue, magnets_used }
// Server responds: { result: [{letter, status, position}...], game_over, solved, medal, score, attempt }
//
// The answer word NEVER leaves the server until the game is complete.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Positions the player had already locked GREEN across their prior guesses.
function lockedGreenPositions(priorGuesses: GuessCell[][], answer: string): Set<number> {
  const locked = new Set<number>();
  for (const g of priorGuesses || []) {
    if (!Array.isArray(g)) continue;
    const res = evaluateCells(g, answer);
    for (const cell of res) {
      if (cell.status === "correct") locked.add(cell.position);
    }
  }
  return locked;
}

// "Gave up" heuristic: on a non-solving final guess, a genuine struggler keeps
// the correct-position letters they already found. If the final guess keeps
// fewer than half of those locked greens, they phoned it in → surrendered.
// If they never locked a green, there's nothing to abandon → not surrender.
function phonedInFinalGuess(
  priorGuesses: GuessCell[][],
  finalCells: GuessCell[],
  answer: string,
): boolean {
  const locked = lockedGreenPositions(priorGuesses, answer);
  if (locked.size === 0) return false;
  const answerLetters = answer.split("");
  let kept = 0;
  for (const pos of locked) {
    const cell = finalCells.find((c) => c.position === pos);
    if (cell && cell.letter === answerLetters[pos]) kept++;
  }
  return kept / locked.size < 0.5;
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

    const { puzzle_id, guess_cells, used_clue, magnets_used, guess_number, is_daily, surrender, prior_guesses } =
      await req.json();

    if (!puzzle_id || (!surrender && !guess_cells)) {
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

    // ---- Explicit surrender (white flag) ----
    if (surrender) {
      const surrenderGuessNum = guess_number ? parseInt(String(guess_number)) : 0;
      const surrenderResp: Record<string, unknown> = {
        game_over: true,
        solved: false,
        surrendered: true,
      };

      if (is_daily) {
        // Daily mode: no attempt record. Reveal and mark used.
        surrenderResp.word = answerWord;
        surrenderResp.definition = answerDefinition;
        await supabaseAdmin
          .from("daily_words")
          .update({ status: "used" })
          .eq("id", puzzle_id)
          .eq("status", "scheduled");
      } else {
        const isOwnPuzzle = creatorId === user.id;
        const magnetsUsedClamped = Math.min(2, Math.max(0, Number(magnets_used) || 0));
        const { error: surrenderError } = await supabaseAdmin
          .from("attempts")
          .insert({
            puzzle_id,
            user_id: user.id,
            total_guesses: surrenderGuessNum,
            medal: null,
            score: 0,
            used_clue: !!used_clue,
            magnets_used: magnetsUsedClamped,
            is_own_puzzle: isOwnPuzzle,
            surrendered: true,
          });

        if (surrenderError && surrenderError.code !== "23505") {
          console.error("Failed to record surrender:", surrenderError);
          return new Response(
            JSON.stringify({ error: "Could not record your result — please try again." }),
            { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
          );
        }

        surrenderResp.medal = null;
        surrenderResp.score = 0;
        surrenderResp.is_own_puzzle = isOwnPuzzle;
        surrenderResp.word = answerWord;
        surrenderResp.definition = answerDefinition;
        surrenderResp.clue = answerClue;
        surrenderResp.inspo = answerInspo;
      }

      return new Response(JSON.stringify(surrenderResp), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
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
        // Clamp magnets to the allowed range. The client counter can overshoot
        // the intended max of 2 (e.g. a double-fired tap), and the
        // attempts.magnets_used CHECK constraint (0..2) would then reject the
        // ENTIRE insert — silently losing a completed game and leaving the
        // puzzle un-closeable and replayable. Clamp so a valid solve always
        // records. Penalty caps at the 2-magnet rate regardless.
        const magnetsUsedClamped = Math.min(2, Math.max(0, Number(magnets_used) || 0));
        // Clues are free — no penalty for using them.
        const magnetPenalty =
          magnetsUsedClamped === 0 ? 1 : magnetsUsedClamped === 1 ? 0.75 : 0.25;
        const score = isOwnPuzzle
          ? 0
          : Math.round(puzzleComplexity * multiplier * magnetPenalty);

        // Phoned-in "gave up": only on a non-solving final guess, only for
        // friendly puzzles played by someone other than the creator.
        const surrendered =
          !solved && !isOwnPuzzle &&
          phonedInFinalGuess(prior_guesses || [], guess_cells, answerWord);

        const { data: attempt, error: attemptError } = await supabaseAdmin
          .from("attempts")
          .insert({
            puzzle_id,
            user_id: user.id,
            total_guesses: guessNumber,
            medal: isOwnPuzzle ? null : medal,
            score,
            used_clue: !!used_clue,
            magnets_used: magnetsUsedClamped,
            is_own_puzzle: isOwnPuzzle,
            surrendered,
          })
          .select()
          .single();

        if (attemptError && attemptError.code !== "23505") {
          // 23505 = unique_violation: a concurrent request already recorded
          // this attempt — that's fine, the puzzle is genuinely complete.
          // Any other failure means the result was NOT saved, so surface an
          // error instead of returning a phantom win the client can't persist.
          console.error("Failed to create attempt:", attemptError);
          return new Response(
            JSON.stringify({ error: "Could not record your result — please try again." }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            },
          );
        }

        responseData.medal = isOwnPuzzle ? null : medal;
        responseData.score = score;
        responseData.is_own_puzzle = isOwnPuzzle;
        responseData.surrendered = surrendered;
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
