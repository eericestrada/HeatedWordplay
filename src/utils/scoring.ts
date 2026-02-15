import type { Medal, ComplexityRange } from "../types";

export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

export function calcComplexity(word: string): number {
  return word
    .toUpperCase()
    .split("")
    .reduce((sum, ch) => sum + (LETTER_VALUES[ch] || 0), 0);
}

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

export function getComplexityRange(score: number): ComplexityRange {
  if (score < 10)
    return {
      label: "< 10",
      icon: "\u2726",
      color: "rgba(120,220,120,0.7)",
      bg: "rgba(120,220,120,0.08)",
    };
  if (score < 20)
    return {
      label: "10\u201320",
      icon: "\u26A1",
      color: "rgba(255,180,60,0.7)",
      bg: "rgba(255,180,60,0.08)",
    };
  return {
    label: "20+",
    icon: "\uD83D\uDD25",
    color: "rgba(255,100,100,0.8)",
    bg: "rgba(255,100,100,0.08)",
  };
}

export function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
