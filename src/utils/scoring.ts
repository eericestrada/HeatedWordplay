import type { Medal, DifficultyBreakdown } from "../types";

export function getMedal(guessCount: number, solved: boolean): Medal | null {
  if (!solved) return null;
  if (guessCount <= 2) return "gold";
  if (guessCount <= 4) return "silver";
  return "bronze";
}

export function getMedalEmoji(
  medal: Medal | null | "submitted" | "surrendered" | "failed",
): string {
  if (medal === "gold") return "\u{1F947}";
  if (medal === "silver") return "\u{1F948}";
  if (medal === "bronze") return "\u{1F949}";
  if (medal === "submitted") return "\u270D\uFE0F";
  if (medal === "surrendered") return "\u{1F3F3}\uFE0F"; // \uD83C\uDFF3\uFE0F gave up
  return "\u274C"; // failed / no medal \u2014 stumped
}

export function getMultiplier(medal: Medal | null): number {
  if (medal === "gold") return 3;
  if (medal === "silver") return 2;
  if (medal === "bronze") return 1;
  return 0;
}

export function getMedalLabel(medal: Medal | null): string {
  if (medal === "gold") return "GOLD";
  if (medal === "silver") return "SILVER";
  if (medal === "bronze") return "BRONZE";
  return "NO MEDAL";
}

// ── Difficulty scoring v1 ──
// Tiers (calibrated to the new-scale distribution): Cake ≤13 / Easy 14-16 /
// Medium 17-19 / Hard 20-25 / Nightmare ≥26.

export interface DifficultyTier {
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export function getDifficultyTier(score: number): DifficultyTier {
  if (score <= 13)
    return { label: "Cake", icon: "🍰", color: "rgba(120,220,120,0.85)", bg: "rgba(120,220,120,0.08)" };
  if (score <= 16)
    return { label: "Easy", icon: "✦", color: "rgba(150,210,120,0.8)", bg: "rgba(150,210,120,0.08)" };
  if (score <= 19)
    return { label: "Medium", icon: "⚡", color: "rgba(255,180,60,0.8)", bg: "rgba(255,180,60,0.08)" };
  if (score <= 25)
    return { label: "Hard", icon: "🔥", color: "rgba(255,120,60,0.85)", bg: "rgba(255,120,60,0.1)" };
  return { label: "Nightmare", icon: "💀", color: "rgba(255,90,90,0.9)", bg: "rgba(255,90,90,0.1)" };
}

// ── Torment scoring (The Pantheon) ──
// Per word: dead ends × a gentle difficulty weight, plus a give-up bonus for
// each non-solve. Dead ends + give-ups dominate; difficulty only nudges, so a
// brutal Medium word can outrank an easy Nightmare. Placeholder knobs — retune
// freely (kept here, not in SQL, so no migration is needed to change them).
const TORMENT_WEIGHTS: Record<string, number> = {
  Cake: 1.0,
  Easy: 1.05,
  Medium: 1.1,
  Hard: 1.2,
  Nightmare: 1.3,
};
const TORMENT_STUMPED_BONUS = 25;
const TORMENT_GAVE_UP_BONUS = 20;

export function tormentScore(e: {
  complexity: number;
  has_breakdown: boolean;
  dead_ends: number;
  failed_count: number;
  surrendered_count: number;
}): number {
  // Legacy (un-scored) words use a neutral weight — their complexity is on the
  // old scale and not comparable to the v1 tier thresholds.
  const weight = e.has_breakdown
    ? TORMENT_WEIGHTS[getDifficultyTier(e.complexity).label] ?? 1
    : 1;
  return Math.round(
    e.dead_ends * weight +
      e.failed_count * TORMENT_STUMPED_BONUS +
      e.surrendered_count * TORMENT_GAVE_UP_BONUS,
  );
}

// Additive contributors for display. The locate terms (length/flow/spread) are
// folded into one "Letters" value AFTER the common-letter discount, so the chips
// sum to the stored difficulty.
export function difficultyFactors(b: DifficultyBreakdown): { label: string; value: number }[] {
  const locateNet =
    Math.round((b.length + b.flow + b.spread) * (1 - 0.6 * b.letter_ease) * 10) / 10;
  const out: { label: string; value: number }[] = [{ label: "Base", value: b.base }];
  if (b.rarity) out.push({ label: "Rarity", value: b.rarity });
  if (b.repeat) out.push({ label: "Repeats", value: b.repeat });
  if (b.concentrated) out.push({ label: "Neighbors", value: b.concentrated });
  if (locateNet) out.push({ label: "Letters", value: locateNet });
  return out;
}

export function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
