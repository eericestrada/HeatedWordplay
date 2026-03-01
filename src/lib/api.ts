import { supabase } from "./supabase";
import type {
  DictionaryEntry,
  PairStreak,
  PuzzleStats,
  LeaderboardEntry,
  PlayerStats,
  CreatorStats,
  DailyWordMeta,
  DailyPoolWord,
  DailyPoolAnonymous,
} from "../types";

/**
 * Invoke a Supabase Edge Function with automatic session refresh on 401.
 * If the call fails with a 401 (expired token), refreshes the session and
 * retries once. If refresh also fails, signs out and throws a clear error.
 */
async function invokeWithRetry<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const attempt = async () => {
    const { data, error, response } = await supabase.functions.invoke(
      functionName,
      { body },
    );
    if (error) {
      if (response?.status === 401) {
        throw { isAuthError: true };
      }
      // Try to extract the specific error message from the response body.
      // Supabase JS wraps non-2xx responses in a FunctionsHttpError whose
      // .message is generic ("Edge Function returned a non-2xx status code").
      // The real error message is in the response JSON body.
      let detail: string | undefined;
      if (response) {
        try {
          const respBody = await response.json();
          detail = respBody?.error;
        } catch {
          // response body wasn't JSON or was already consumed — ignore
        }
      }
      console.error(`[${functionName}] status=${response?.status} detail=${detail} message=${error.message}`);
      throw new Error(detail || error.message || `Failed to call ${functionName}`);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  };

  try {
    return await attempt();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "isAuthError" in err) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        await supabase.auth.signOut();
        throw new Error("Session expired — please sign in again");
      }
      return await attempt();
    }
    throw err;
  }
}

/**
 * Look up a word using the free dictionary API.
 * Returns definitions or null if word not found.
 */
export async function lookupWord(
  word: string,
): Promise<DictionaryEntry[] | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.length === 0) return null;

    const entries: DictionaryEntry[] = [];
    for (const entry of data) {
      for (const meaning of entry.meanings || []) {
        for (const def of meaning.definitions || []) {
          entries.push({
            partOfSpeech: meaning.partOfSpeech,
            definition: def.definition,
          });
        }
      }
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Submit a new puzzle via Edge Function.
 * Uses supabase.functions.invoke() for automatic auth and CORS handling.
 */
export async function submitPuzzle(params: {
  word: string;
  definition: string;
  part_of_speech: string;
  clue: string | null;
  inspo: string;
  is_public: boolean;
  shares: Array<{
    share_type: "group" | "user";
    target_id: string;
    allow_reshare: boolean;
  }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return invokeWithRetry<any>("submit-word", params as unknown as Record<string, unknown>);
}

/**
 * Use magnet power-up via Edge Function.
 * Server returns the correct position for the letter.
 */
export async function useMagnetServer(params: {
  puzzle_id: string;
  letter: string;
  current_grid: Array<{ letter: string; position: number; pinned: boolean }>;
}) {
  return invokeWithRetry<{ position: number; letter: string }>(
    "use-magnet",
    params as unknown as Record<string, unknown>,
  );
}

/**
 * Add shares to an existing puzzle (groups or individual users).
 * Uses direct client-side inserts — RLS allows puzzle creators to share.
 */
export async function addPuzzleShares(
  puzzleId: string,
  shares: Array<{ share_type: "group" | "user"; target_id: string }>,
) {
  if (shares.length === 0) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = shares.map((s) => ({
    puzzle_id: puzzleId,
    share_type: s.share_type,
    target_id: s.target_id,
    shared_by: user.id,
    allow_reshare: false,
  }));

  const { error } = await supabase.from("puzzle_shares").insert(rows);
  if (error) throw new Error(error.message || "Failed to share puzzle");
}

/**
 * Update a puzzle's public visibility.
 * Only works if no other users have attempted the puzzle yet (RLS constraint).
 */
export async function updatePuzzlePublic(
  puzzleId: string,
  isPublic: boolean,
) {
  const { error } = await supabase
    .from("puzzles")
    .update({ is_public: isPublic })
    .eq("id", puzzleId);

  if (error) throw new Error(error.message || "Failed to update puzzle");
}

/**
 * Save guess history (rows) to an existing attempt record.
 * Called after game completion so users can revisit their guesses later.
 */
export async function saveAttemptGuesses(
  puzzleId: string,
  guesses: Array<{ result: Array<{ letter: string; status: string | null }> }>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("attempts")
    .update({ guesses })
    .eq("puzzle_id", puzzleId)
    .eq("user_id", user.id);
}

/**
 * Fetch a completed attempt's data including guess history.
 */
export async function getAttempt(puzzleId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("puzzle_id", puzzleId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Fetch bilateral streaks for the current user with all partners.
 * Returns current streak count, last activity date, and total completions per partner.
 */
export async function getPairStreaks(userId: string): Promise<PairStreak[]> {
  const { data, error } = await supabase.rpc("get_pair_streaks", {
    p_user_id: userId,
  });
  if (error) {
    console.error("Failed to fetch pair streaks:", error);
    return [];
  }
  return (data as PairStreak[]) || [];
}

/**
 * Per-puzzle stats: solve rate, guess distribution, and individual solver results.
 */
export async function getPuzzleStats(
  puzzleId: string,
  groupId: string,
): Promise<PuzzleStats | null> {
  const { data, error } = await supabase.rpc("get_puzzle_stats", {
    p_puzzle_id: puzzleId,
    p_group_id: groupId,
  });
  if (error) {
    console.error("Failed to fetch puzzle stats:", error);
    return null;
  }
  return data as PuzzleStats;
}

/**
 * Group leaderboard: ranks players by total score within a group.
 */
export async function getGroupLeaderboard(
  groupId: string,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_group_leaderboard", {
    p_group_id: groupId,
  });
  if (error) {
    console.error("Failed to fetch group leaderboard:", error);
    return [];
  }
  return (data as LeaderboardEntry[]) || [];
}

/**
 * Personal career stats: overall performance across all puzzles.
 */
export async function getPlayerStats(
  userId: string,
): Promise<PlayerStats | null> {
  const { data, error } = await supabase.rpc("get_player_stats", {
    p_user_id: userId,
  });
  if (error) {
    console.error("Failed to fetch player stats:", error);
    return null;
  }
  return data as PlayerStats;
}

/**
 * Creator stats: how a player's submitted puzzles have performed.
 */
export async function getCreatorStats(
  userId: string,
): Promise<CreatorStats | null> {
  const { data, error } = await supabase.rpc("get_creator_stats", {
    p_user_id: userId,
  });
  if (error) {
    console.error("Failed to fetch creator stats:", error);
    return null;
  }
  return data as CreatorStats;
}

/**
 * Evaluate a guess via Edge Function.
 * The answer word never leaves the server.
 */
export async function evaluateGuess(params: {
  puzzle_id: string;
  guess_cells: Array<{ letter: string; position: number }>;
  used_clue: boolean;
  magnets_used: number;
  guess_number: number;
  is_daily?: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return invokeWithRetry<any>("evaluate-guess", {
    puzzle_id: params.puzzle_id,
    guess_cells: params.guess_cells,
    used_clue: params.used_clue,
    magnets_used: params.magnets_used,
    guess_number: params.guess_number,
    is_daily: params.is_daily || false,
  });
}

// ============================================================
// Daily Words API
// ============================================================

/**
 * Submit a word to the Daily Heat pool (WordMaster/Editor only).
 */
export async function submitDailyWord(params: {
  word: string;
  definition: string;
  part_of_speech: string;
}) {
  return invokeWithRetry<{ id: string; word: string; status: string; created_at: string }>(
    "submit-daily-word",
    params as unknown as Record<string, unknown>,
  );
}

/**
 * Fetch today's scheduled daily word metadata (definition visible, word hidden).
 * Uses the secure view so the actual word is not exposed.
 */
export async function fetchTodaysDailyWord(): Promise<DailyWordMeta | null> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_words_calendar")
    .select("id, scheduled_date, word_length, definition")
    .eq("scheduled_date", today)
    .in("status", ["scheduled", "used"])
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    scheduled_date: data.scheduled_date,
    wordLength: data.word_length,
    definition: data.definition,
  };
}

/**
 * Fetch the current user's own daily word submissions (full details).
 * RLS scopes to own rows for WordMasters.
 */
export async function fetchMyDailyWords(): Promise<DailyPoolWord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("daily_words")
    .select("id, word, definition, part_of_speech, status, scheduled_date, created_at")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch own daily words:", error);
    return [];
  }
  return (data || []) as DailyPoolWord[];
}

/**
 * Fetch anonymous pool entries visible to WordMasters.
 * Uses the secure view — word/definition are hidden for others' entries.
 */
export async function fetchPoolAnonymous(): Promise<DailyPoolAnonymous[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("daily_words_calendar")
    .select("id, word_length, status, submitted_by, submitted_by_username, submitted_by_display_name, created_at")
    .neq("submitted_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch pool anonymous:", error);
    return [];
  }
  return (data || []) as DailyPoolAnonymous[];
}

/**
 * Update own pending/scheduled daily word.
 */
export async function updateDailyWord(
  id: string,
  updates: { word?: string; definition?: string; part_of_speech?: string },
) {
  const { error } = await supabase
    .from("daily_words")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message || "Failed to update word");
}

/**
 * Fetch ALL daily words (Editor-only — RLS gives editors full access).
 */
export async function fetchAllDailyWords(): Promise<DailyPoolWord[]> {
  const { data, error } = await supabase
    .from("daily_words")
    .select("id, word, definition, part_of_speech, status, scheduled_date, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch all daily words:", error);
    return [];
  }
  return (data || []) as DailyPoolWord[];
}

/**
 * Schedule a daily word to a specific date (Editor-only).
 */
export async function scheduleDailyWord(id: string, date: string) {
  const { error } = await supabase
    .from("daily_words")
    .update({ scheduled_date: date, status: "scheduled" })
    .eq("id", id);
  if (error) throw new Error(error.message || "Failed to schedule word");
}

/**
 * Remove a daily word from the schedule (Editor-only).
 */
export async function unscheduleDailyWord(id: string) {
  const { error } = await supabase
    .from("daily_words")
    .update({ scheduled_date: null, status: "pending" })
    .eq("id", id);
  if (error) throw new Error(error.message || "Failed to unschedule word");
}
