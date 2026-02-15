import { supabase } from "./supabase";
import type { DictionaryEntry } from "../types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-word`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit puzzle");
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/use-magnet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to use magnet");
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/evaluate-guess`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "x-guess-number": String(params.guess_number),
    },
    body: JSON.stringify({
      puzzle_id: params.puzzle_id,
      guess_cells: params.guess_cells,
      used_clue: params.used_clue,
      magnets_used: params.magnets_used,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to evaluate guess");
  return data;
}
