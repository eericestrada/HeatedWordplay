import type { Medal, DifficultyBreakdown } from "../types";

export function getMedal(guessCount: number, solved: boolean): Medal | null {
  if (!solved) return null;
  if (guessCount <= 2) return "gold";
  if (guessCount <= 4) return "silver";
  return "bronze";
}

export function getMedalEmoji(medal: Medal | null | "submitted"): string {
  if (medal === "gold") return "\u{1F947}";
  if (medal === "silver") return "\u{1F948}";
  if (medal === "bronze") return "\u{1F949}";
  if (medal === "submitted") return "\u270D\uFE0F";
  return "\u274C";
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
