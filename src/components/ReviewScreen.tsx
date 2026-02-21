import { useState, useEffect } from "react";
import Tile from "./Tile";
import { getAttempt } from "../lib/api";
import {
  getMedalEmoji,
  getMedalLabel,
  getMultiplier,
  formatDate,
} from "../utils/scoring";
import PuzzleStatsPanel from "./PuzzleStatsPanel";
import type { Puzzle, CompletedRow, ResultCell, Medal } from "../types";

interface ReviewScreenProps {
  puzzle: Puzzle;
  onBack: () => void;
  groupId?: string | null;
}

export default function ReviewScreen({ puzzle, onBack, groupId = null }: ReviewScreenProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CompletedRow[]>([]);
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getAttempt(puzzle.id as string);
      if (data) {
        setAttempt(data);
        // Parse guesses from the JSONB column
        const guesses = data.guesses as CompletedRow[] | null;
        if (guesses && Array.isArray(guesses) && guesses.length > 0) {
          setRows(guesses);
        }
      }
      setLoading(false);
    })();
  }, [puzzle.id]);

  const medal = (attempt?.medal as Medal) || null;
  const totalGuesses = (attempt?.total_guesses as number) || 0;
  const usedClue = (attempt?.used_clue as boolean) || false;
  const magnetsUsed = (attempt?.magnets_used as number) || 0;
  const solved = medal !== null;
  const wordLength = puzzle.wordLength || puzzle.word.length;

  const multiplier = getMultiplier(medal);
  const cluePenalty = usedClue ? 0.5 : 1.0;
  const magnetPenalty = magnetsUsed === 0 ? 1 : magnetsUsed === 1 ? 0.75 : 0.25;
  const finalScore = Math.round(puzzle.complexity * multiplier * cluePenalty * magnetPenalty);

  const aids = [
    usedClue && "clue",
    magnetsUsed > 0 && `${magnetsUsed} magnet${magnetsUsed > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" + ");

  // Build emoji grid
  const emojiGrid = rows
    .map((row) =>
      row.result
        .map((cell) => {
          if (!cell.letter) return "\u2b1c";
          if (cell.status === "correct") return "\ud83d\udfe9";
          if (cell.status === "present") return "\ud83d\udfe6";
          return "\u2b1b";
        })
        .join(""),
    )
    .join("\n");

  const shareText = [
    "\ud83d\udd25 Heated Wordplay",
    `${puzzle.creator === "You" ? "My" : `${puzzle.creator}'s`} puzzle \u00b7 ${wordLength} letters`,
    "",
    emojiGrid,
    "",
    solved
      ? `${getMedalEmoji(medal)} ${getMedalLabel(medal)} \u00b7 ${totalGuesses}/6${aids ? ` \u00b7 ${aids}` : ""} \u00b7 Score: ${finalScore}`
      : `\u274c ${totalGuesses}/6${aids ? ` \u00b7 ${aids}` : ""}`,
  ].join("\n");

  const handleCopy = () => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ padding: "60px 20px" }}
      >
        <div
          className="font-body"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
      style={{ padding: "24px 20px 40px", animation: "fadeUp 0.4s ease" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={onBack}
          className="font-body"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          \u2190 Back
        </button>
        <div
          className="font-mono uppercase tracking-[0.12em]"
          style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}
        >
          Review
        </div>
      </div>

      {/* Medal + Word */}
      <div className="text-center">
        <div style={{ fontSize: "48px", lineHeight: 1 }}>
          {getMedalEmoji(medal)}
        </div>
        <div
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#f5f0e8",
            letterSpacing: "0.08em",
            marginTop: "8px",
          }}
        >
          {puzzle.word}
        </div>
        <div
          className="font-body"
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.35)",
            marginTop: "4px",
          }}
        >
          {puzzle.creator === "You" ? "Your" : `${puzzle.creator}'s`} puzzle
          {" \u00b7 "}
          {formatDate(puzzle.submittedAt)}
        </div>
      </div>

      {/* Definition */}
      {puzzle.definition && (
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            padding: "16px 20px",
            borderLeft: "3px solid rgba(255,180,60,0.5)",
          }}
        >
          <div
            className="font-body italic"
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.8)",
            }}
          >
            {puzzle.definition}
          </div>
        </div>
      )}

      {/* Guess grid */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5 items-center w-full">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-1.5 justify-center">
              {row.result.map((cell: ResultCell, ci: number) => (
                <Tile
                  key={ci}
                  letter={cell.letter}
                  status={cell.status}
                  isActive={false}
                  isRevealing={false}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="font-body text-center rounded-lg w-full"
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.02)",
            padding: "24px 16px",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          Guess history not available for this puzzle.
          {"\n"}(Puzzles completed before this update don't have saved guesses.)
        </div>
      )}

      {/* Score summary */}
      {attempt && (
        <div
          className="font-body"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
        >
          {solved
            ? `Solved in ${totalGuesses} guess${totalGuesses !== 1 ? "es" : ""}`
            : `Used all ${totalGuesses} guesses`}
          {aids && ` \u00b7 ${aids}`}
          {solved && ` \u00b7 Score: ${finalScore}`}
        </div>
      )}

      {/* Inspo */}
      {puzzle.context && (
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,255,255,0.02)",
            padding: "14px 20px",
          }}
        >
          <div
            className="font-body uppercase tracking-[0.12em]"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.3)",
              marginBottom: "4px",
            }}
          >
            {puzzle.creator === "You"
              ? "Your inspo"
              : `Why ${puzzle.creator} chose this word`}
          </div>
          <div
            className="font-body"
            style={{
              fontSize: "13px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            "{puzzle.context}"
          </div>
        </div>
      )}

      {/* Per-puzzle group stats */}
      <PuzzleStatsPanel puzzleId={puzzle.id as string} groupId={groupId} />

      {/* Actions */}
      <div className="flex gap-2.5 w-full">
        <button
          onClick={onBack}
          className="font-body flex-1"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            padding: "12px 20px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Back to puzzles
        </button>
        {rows.length > 0 && (
          <button
            onClick={handleCopy}
            className="font-body flex-1"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "12px 20px",
              borderRadius: "8px",
              border: copied
                ? "1px solid rgba(45,138,78,0.4)"
                : "1px solid rgba(255,180,60,0.3)",
              background: copied
                ? "rgba(45,138,78,0.12)"
                : "rgba(255,180,60,0.08)",
              color: copied
                ? "rgba(45,138,78,0.95)"
                : "rgba(255,180,60,0.9)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {copied ? "Copied!" : "Share results"}
          </button>
        )}
      </div>
    </div>
  );
}
