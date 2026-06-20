import type { CreatorStats } from "../types";

// localStorage key for the per-puzzle "solvers I've already seen" counts.
// "New solvers" on the My Words hub = solve_count - last-seen count.
const SEEN_KEY = "hw-mywords-seen";

export function getSeenMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** Acknowledge a puzzle's current solver count so its "N new" badge clears. */
export function markSeen(puzzleId: string, solveCount: number): void {
  try {
    const m = getSeenMap();
    m[puzzleId] = solveCount;
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {
    // best-effort — ignore storage failures
  }
}

export interface MyWordRow {
  puzzleId: string;
  word: string;
  createdAt: string;
  plays: number;
  solves: number;
  newSolvers: number;
  isPublic: boolean;
  hasShares: boolean;
  /** Created, never shared/public, and never played — only the creator can see it. */
  isDraft: boolean;
}

/**
 * Combine creator stats with each puzzle's visibility (public flag + whether
 * it has any shares) into rows for the My Words hub. A puzzle is a "draft"
 * when it is not public, has no shares, and has no plays yet.
 */
export function buildMyWordRows(
  stats: CreatorStats | null,
  isPublicById: Record<string, boolean>,
  sharedIds: Set<string>,
  seen: Record<string, number>,
): MyWordRow[] {
  if (!stats) return [];
  return stats.puzzles.map((p) => {
    const isPublic = !!isPublicById[p.puzzle_id];
    const hasShares = sharedIds.has(p.puzzle_id);
    const isDraft = !isPublic && !hasShares && p.play_count === 0;
    return {
      puzzleId: p.puzzle_id,
      word: p.word,
      createdAt: p.created_at,
      plays: p.play_count,
      solves: p.solve_count,
      newSolvers: Math.max(0, p.solve_count - (seen[p.puzzle_id] ?? 0)),
      isPublic,
      hasShares,
      isDraft,
    };
  });
}

export interface MyWordsSummary {
  words: number;
  plays: number;
  newSolvers: number;
}

/** Hub/home summary. Drafts do NOT count toward "words created". */
export function summarizeMyWords(rows: MyWordRow[]): MyWordsSummary {
  return {
    words: rows.filter((r) => !r.isDraft).length,
    plays: rows.reduce((s, r) => s + r.plays, 0),
    newSolvers: rows.reduce((s, r) => s + r.newSolvers, 0),
  };
}
