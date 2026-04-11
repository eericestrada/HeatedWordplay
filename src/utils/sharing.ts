/**
 * Sharing utilities for puzzle links and the Web Share API.
 */

import type { CompletedRow } from "../types";

/**
 * Build an emoji grid string from completed rows.
 * 🟩 = correct, 🟦 = present, ⬛ = absent, ⬜ = empty
 */
export function buildEmojiGrid(rows: CompletedRow[]): string {
  return (rows || [])
    .map((row) =>
      row.result
        .map((cell) => {
          if (!cell.letter) return "⬜";
          if (cell.status === "correct") return "🟩";
          if (cell.status === "present") return "🟦";
          return "⬛";
        })
        .join(""),
    )
    .join("\n");
}

/**
 * Build an emoji grid with guesses visible.
 * Each row shows the guessed word followed by the emoji pattern.
 * e.g. "FLAME 🟩🟩🟩⬛🟩"
 */
export function buildEmojiGridWithGuesses(rows: CompletedRow[]): string {
  return (rows || [])
    .map((row) => {
      const word = row.result.map((cell) => cell.letter || " ").join("");
      const emojis = row.result
        .map((cell) => {
          if (!cell.letter) return "⬜";
          if (cell.status === "correct") return "🟩";
          if (cell.status === "present") return "🟦";
          return "⬛";
        })
        .join("");
      return `${word} ${emojis}`;
    })
    .join("\n");
}

/**
 * Share text via Web Share API or clipboard (no puzzle URL appended).
 */
export async function shareText(
  text: string,
): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Heated Wordplay", text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "failed";
      }
    }
  }
  const ok = await copyToClipboard(text);
  return ok ? "copied" : "failed";
}

/**
 * Build a shareable URL for a puzzle.
 */
export function buildPuzzleUrl(puzzleId: string): string {
  const base = window.location.origin;
  return `${base}/play/${puzzleId}`;
}

/**
 * Copy text to clipboard using the most reliable method available.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy method
    }
  }

  // Legacy fallback (works on older mobile browsers)
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share a puzzle link using the Web Share API if available,
 * otherwise copy the link to clipboard.
 * Returns "shared" if native share was used, "copied" if clipboard,
 * or "failed" if neither worked.
 */
export async function sharePuzzleLink(
  puzzleId: string,
  _creatorName: string,
  wordLength: number,
): Promise<"shared" | "copied" | "failed"> {
  const url = buildPuzzleUrl(puzzleId);
  const text = `Can you solve my ${wordLength}-letter word puzzle? 🔥`;
  const title = "Heated Wordplay";

  // Try Web Share API (supported on mobile browsers)
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      // User cancelled or share failed — fall through to copy
      if (err instanceof DOMException && err.name === "AbortError") {
        return "failed"; // User cancelled intentionally
      }
    }
  }

  // Fallback: copy link to clipboard
  const ok = await copyToClipboard(url);
  return ok ? "copied" : "failed";
}

/**
 * Share game results (emoji grid + link) using Web Share API or clipboard.
 */
export async function shareResults(
  shareText: string,
  puzzleId: string,
): Promise<"shared" | "copied" | "failed"> {
  const url = buildPuzzleUrl(puzzleId);
  const fullText = `${shareText}\n\n${url}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Heated Wordplay",
        text: fullText,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "failed";
      }
    }
  }

  const ok = await copyToClipboard(fullText);
  return ok ? "copied" : "failed";
}
