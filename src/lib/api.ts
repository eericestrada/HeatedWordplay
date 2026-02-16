import { supabase } from "./supabase";
import type { DictionaryEntry } from "../types";

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
  const { data, error } = await supabase.functions.invoke("submit-word", {
    body: params,
  });

  if (error) throw new Error(error.message || "Failed to submit puzzle");
  if (data?.error) throw new Error(data.error);
  return data;
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
  const { data, error } = await supabase.functions.invoke("use-magnet", {
    body: params,
  });

  if (error) throw new Error(error.message || "Failed to use magnet");
  if (data?.error) throw new Error(data.error);
  return data as { position: number; letter: string };
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
}) {
  const { data, error } = await supabase.functions.invoke("evaluate-guess", {
    body: {
      puzzle_id: params.puzzle_id,
      guess_cells: params.guess_cells,
      used_clue: params.used_clue,
      magnets_used: params.magnets_used,
      guess_number: params.guess_number,
    },
  });

  if (error) throw new Error(error.message || "Failed to evaluate guess");
  if (data?.error) throw new Error(data.error);
  return data;
}
