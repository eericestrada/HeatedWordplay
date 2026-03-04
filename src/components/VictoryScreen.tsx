import { useState } from "react";
import type { Puzzle, CompletedRow, Medal, GameMode } from "../types";
import {
  getMedalEmoji,
  getMultiplier,
  getMedalLabel,
  formatDate,
} from "../utils/scoring";
import { buildEmojiGrid, shareText as shareTextUtil, shareResults, buildPuzzleUrl } from "../utils/sharing";
import PuzzleStatsPanel from "./PuzzleStatsPanel";

interface VictoryScreenProps {
  puzzle: Puzzle;
  totalGuesses: number;
  medal: Medal | null;
  usedClue: boolean;
  magnetsUsed: number;
  rows: CompletedRow[];
  onBack: () => void;
  creatorStreak?: number;
  groupId?: string | null;
  gameMode?: GameMode;
  dailyStreak?: number;
}

export default function VictoryScreen({
  puzzle,
  totalGuesses,
  medal,
  usedClue: _usedClue,
  magnetsUsed,
  rows,
  onBack,
  creatorStreak = 0,
  groupId = null,
  gameMode = "friendly",
  dailyStreak = 0,
}: VictoryScreenProps) {
  const multiplier = getMultiplier(medal);
  // Clues are free — no penalty.
  const magnetPenalty =
    magnetsUsed === 0 ? 1 : magnetsUsed === 1 ? 0.75 : 0.25;
  const finalScore = Math.round(puzzle.complexity * multiplier * magnetPenalty);
  const solved = medal !== null;
  const [copied, setCopied] = useState(false);
  const isDaily = gameMode === "daily";

  const emojiGrid = buildEmojiGrid(rows);

  const aids = [
    magnetsUsed > 0 &&
      `${magnetsUsed} magnet${magnetsUsed > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" + ");

  // Build share text based on game mode
  let shareText: string;
  if (isDaily) {
    if (solved) {
      shareText = [
        `🔥 Daily Heat`,
        `Got in there in ${totalGuesses}/6`,
        emojiGrid,
      ].join("\n");
    } else {
      shareText = [
        `🔥 Daily Heat`,
        "This one got away.",
        emojiGrid,
      ].join("\n");
    }
  } else {
    const creator = puzzle.creator;
    if (solved) {
      shareText = [
        `Nailed @${creator}'s word in ${totalGuesses}/6`,
        emojiGrid,
      ].join("\n");
    } else {
      shareText = [
        `@${creator}'s word got me.`,
        emojiGrid,
      ].join("\n");
    }
  }

  const handleShare = async () => {
    if (isDaily) {
      const result = await shareTextUtil(shareText);
      if (result === "copied" || result === "shared") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      const result = await shareResults(shareText, puzzle.id as string);
      if (result === "copied" || result === "shared") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const scoreItems = [
    { label: "Complexity", value: String(puzzle.complexity), hl: false, penalty: false },
    { label: "Multiplier", value: `${multiplier}×`, hl: false, penalty: false },
    ...(magnetsUsed > 0
      ? [
          {
            label: `Magnet ×${magnetsUsed}`,
            value: magnetsUsed === 1 ? "-25%" : "-75%",
            hl: false,
            penalty: true,
          },
        ]
      : []),
    { label: "Score", value: String(finalScore), hl: true, penalty: false },
  ];

  return (
    <div
      className="flex flex-col items-center gap-6 max-w-[480px] mx-auto"
      style={{
        padding: "24px 20px 40px",
        animation: "fadeUp 0.5s ease",
      }}
    >
      <div style={{ fontSize: "64px", lineHeight: 1 }}>
        {isDaily ? (solved ? "🔥" : "❌") : getMedalEmoji(medal)}
      </div>

      <div className="text-center">
        <div
          className="font-mono uppercase tracking-[0.15em]"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: solved
              ? "rgba(255,180,60,0.6)"
              : "rgba(255,255,255,0.3)",
            marginBottom: "8px",
          }}
        >
          {isDaily
            ? (solved ? "Daily Heat" : "Daily Heat")
            : (solved ? getMedalLabel(medal) : "Better luck next time")}
        </div>
        <div
          className="font-display"
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: "#f5f0e8",
            letterSpacing: "0.08em",
          }}
        >
          {puzzle.word}
        </div>
        {!isDaily && (
          <div
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.25)",
              marginTop: "6px",
            }}
          >
            Submitted {formatDate(puzzle.submittedAt)}
          </div>
        )}
      </div>

      {/* Definition */}
      <div
        className="w-full rounded-xl"
        style={{
          background: "rgba(255,255,255,0.04)",
          padding: "20px 24px",
          borderLeft: "3px solid rgba(255,180,60,0.5)",
        }}
      >
        <div
          className="font-body uppercase tracking-[0.12em]"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "rgba(255,180,60,0.7)",
            marginBottom: "8px",
          }}
        >
          Definition
        </div>
        <div
          className="font-body italic"
          style={{
            fontSize: "15px",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {puzzle.definition}
        </div>
      </div>

      {/* Inspo — only for friendlies */}
      {!isDaily && puzzle.context && (
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,255,255,0.02)",
            padding: "16px 24px",
          }}
        >
          <div
            className="font-body uppercase tracking-[0.12em]"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.35)",
              marginBottom: "6px",
            }}
          >
            {puzzle.creator === "You"
              ? "Your inspo"
              : `Why ${puzzle.creator} chose this word`}
          </div>
          <div
            className="font-body"
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            "{puzzle.context}"
          </div>
        </div>
      )}

      {/* Score breakdown — only for friendlies */}
      {!isDaily && (
        <div
          className="w-full grid gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${scoreItems.length}, 1fr)`,
          }}
        >
          {scoreItems.map((item, i) => (
            <div
              key={i}
              className="rounded-[10px] text-center"
              style={{
                background: item.penalty
                  ? "rgba(255,100,100,0.08)"
                  : item.hl
                    ? "rgba(255,180,60,0.12)"
                    : "rgba(255,255,255,0.03)",
                padding: "16px 10px",
                border: item.penalty
                  ? "1px solid rgba(255,100,100,0.15)"
                  : item.hl
                    ? "1px solid rgba(255,180,60,0.25)"
                    : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                className="font-body uppercase tracking-[0.1em]"
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: item.penalty
                    ? "rgba(255,100,100,0.7)"
                    : item.hl
                      ? "rgba(255,180,60,0.8)"
                      : "rgba(255,255,255,0.35)",
                  marginBottom: "6px",
                }}
              >
                {item.label}
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: item.penalty
                    ? "rgba(255,100,100,0.8)"
                    : item.hl
                      ? "rgba(255,180,60,0.95)"
                      : "#f5f0e8",
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Guess summary */}
      <div
        className="font-body"
        style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
      >
        {isDaily
          ? (solved
              ? `Got in there in ${totalGuesses}`
              : "This one got away.")
          : (solved
              ? `Solved in ${totalGuesses} guess${totalGuesses !== 1 ? "es" : ""}`
              : `Used all ${totalGuesses} guesses`)}
        {!isDaily && aids && ` · ${aids}`}
      </div>

      {/* Daily streak callout */}
      {isDaily && dailyStreak > 0 && (
        <div
          className="w-full rounded-xl flex items-center justify-center gap-2"
          style={{
            background: "rgba(255,140,40,0.06)",
            border: "1px solid rgba(255,140,40,0.15)",
            padding: "14px 20px",
          }}
        >
          <span style={{ fontSize: "20px" }}>🔥</span>
          <div className="font-body" style={{ fontSize: "14px", color: "rgba(255,140,40,0.9)" }}>
            <strong>{dailyStreak}-day streak</strong>
          </div>
        </div>
      )}

      {/* Pair streak callout — only for friendlies */}
      {!isDaily && creatorStreak > 0 && puzzle.creator !== "You" && (
        <div
          className="w-full rounded-xl flex items-center justify-center gap-2"
          style={{
            background: "rgba(255,140,40,0.06)",
            border: "1px solid rgba(255,140,40,0.15)",
            padding: "14px 20px",
          }}
        >
          <span style={{ fontSize: "20px" }}>🔥</span>
          <div className="font-body" style={{ fontSize: "14px", color: "rgba(255,140,40,0.9)" }}>
            {creatorStreak === 1 ? (
              <>New streak started with <strong>{puzzle.creator}</strong>!</>
            ) : (
              <><strong>{creatorStreak}-day streak</strong> with {puzzle.creator}</>
            )}
          </div>
        </div>
      )}

      {/* Per-puzzle group stats — only for friendlies */}
      {!isDaily && (
        <PuzzleStatsPanel puzzleId={puzzle.id as string} groupId={groupId} />
      )}

      {/* Share preview */}
      <div
        className="w-full rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          padding: "20px 24px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          className="font-mono whitespace-pre-wrap"
          style={{
            fontSize: "13px",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {shareText}
        </div>
        {!isDaily && (
          <div
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "rgba(100,160,255,0.6)",
              marginTop: "8px",
            }}
          >
            {buildPuzzleUrl(puzzle.id as string)}
          </div>
        )}
      </div>

      {/* Action buttons */}
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
        <button
          onClick={handleShare}
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
            letterSpacing: "0.04em",
          }}
        >
          {copied ? "Shared!" : "Share results"}
        </button>
      </div>
    </div>
  );
}
