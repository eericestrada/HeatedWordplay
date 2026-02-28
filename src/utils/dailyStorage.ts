import type { CompletedRow } from "../types";

const DAILY_ATTEMPT_KEY = "hw-daily-attempt";
const DAILY_STREAK_KEY = "hw-daily-streak";

export interface StoredDailyAttempt {
  date: string;
  solved: boolean;
  guesses: number;
  rows: CompletedRow[];
}

export interface StoredDailyStreak {
  current: number;
  longest: number;
  lastDate: string | null;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export function getDailyAttempt(date: string): StoredDailyAttempt | null {
  try {
    const raw = localStorage.getItem(DAILY_ATTEMPT_KEY);
    if (!raw) return null;
    const attempt = JSON.parse(raw) as StoredDailyAttempt;
    return attempt.date === date ? attempt : null;
  } catch {
    return null;
  }
}

export function saveDailyAttempt(attempt: StoredDailyAttempt): void {
  try {
    localStorage.setItem(DAILY_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // Ignore storage errors
  }
}

export function getDailyStreak(): StoredDailyStreak {
  try {
    const raw = localStorage.getItem(DAILY_STREAK_KEY);
    if (!raw) return { current: 0, longest: 0, lastDate: null };
    return JSON.parse(raw) as StoredDailyStreak;
  } catch {
    return { current: 0, longest: 0, lastDate: null };
  }
}

export function updateDailyStreak(playedDate: string, solved: boolean): StoredDailyStreak {
  const prev = getDailyStreak();

  let current: number;
  if (!solved) {
    // Failed — streak resets
    current = 0;
  } else if (prev.lastDate === playedDate) {
    // Already played today — no change
    return prev;
  } else if (prev.lastDate === yesterdayStr()) {
    // Consecutive day — extend streak
    current = prev.current + 1;
  } else {
    // Gap — start fresh
    current = 1;
  }

  const longest = Math.max(prev.longest, current);
  const streak: StoredDailyStreak = { current, longest, lastDate: playedDate };

  try {
    localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(streak));
  } catch {
    // Ignore storage errors
  }

  return streak;
}

/**
 * Compute the current DailyHeatState from localStorage.
 */
export function computeDailyHeatState(dailyDate: string) {
  const attempt = getDailyAttempt(dailyDate);
  const streak = getDailyStreak();

  if (attempt) {
    // Already played today
    if (attempt.solved) {
      return {
        status: "completed" as const,
        guesses: attempt.guesses,
        streak: streak.current,
        rows: attempt.rows,
      };
    }
    // Played today but failed — streak broken
    return { status: "streak_broken" as const };
  }

  // Haven't played today
  const today = todayStr();
  const yesterday = yesterdayStr();
  if (streak.current > 0 && (streak.lastDate === today || streak.lastDate === yesterday)) {
    return { status: "unplayed" as const, streak: streak.current };
  }

  // No active streak (or it expired)
  if (streak.current > 0 && streak.lastDate && streak.lastDate < yesterday) {
    return { status: "streak_broken" as const };
  }

  return { status: "unplayed" as const, streak: 0 };
}
