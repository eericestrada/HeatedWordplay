import { useState } from "react";
import type { Puzzle, CompletionStatus } from "../types";
import {
  getMedalEmoji,
  getComplexityRange,
  formatDate,
} from "../utils/scoring";

interface PuzzleSelectorProps {
  puzzles: Puzzle[];
  completedPuzzles: Record<string | number, CompletionStatus>;
  onSelect: (puzzle: Puzzle) => void;
  onSubmitWord: () => void;
}

export default function PuzzleSelector({
  puzzles,
  completedPuzzles,
  onSelect,
  onSubmitWord,
}: PuzzleSelectorProps) {
  const [showComplexity, setShowComplexity] = useState(false);

  return (
    <div className="flex flex-col items-center gap-6 max-w-[480px] mx-auto" style={{ padding: "32px 20px" }}>
      <div
        className="font-display text-center"
        style={{ fontSize: "28px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Choose a Puzzle
      </div>
      <div
        className="font-body text-center"
        style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
      >
        Select a word to guess. Trust your instincts.
      </div>

      {/* Complexity toggle */}
      <button
        onClick={() => setShowComplexity(!showComplexity)}
        className="flex items-center gap-2.5"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
      >
        <div
          className="relative rounded-[10px]"
          style={{
            width: "36px",
            height: "20px",
            background: showComplexity
              ? "rgba(255,180,60,0.35)"
              : "rgba(255,255,255,0.1)",
            transition: "background 0.2s ease",
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: "16px",
              height: "16px",
              background: showComplexity
                ? "rgba(255,180,60,0.9)"
                : "rgba(255,255,255,0.35)",
              top: "2px",
              left: showComplexity ? "18px" : "2px",
              transition: "all 0.2s ease",
            }}
          />
        </div>
        <span
          className="font-body"
          style={{
            fontSize: "13px",
            color: showComplexity
              ? "rgba(255,180,60,0.7)"
              : "rgba(255,255,255,0.35)",
            transition: "color 0.2s ease",
          }}
        >
          Show complexity
        </span>
      </button>

      {/* Puzzle list */}
      <div className="flex flex-col gap-2.5 w-full">
        {puzzles.map((p) => {
          const completed = completedPuzzles[p.id];
          const range = getComplexityRange(p.complexity);
          return (
            <button
              key={p.id}
              onClick={() => !completed && onSelect(p)}
              className="flex items-center justify-between rounded-[10px] text-left"
              style={{
                background: completed
                  ? "rgba(255,255,255,0.01)"
                  : "rgba(255,255,255,0.03)",
                border: completed
                  ? "1px solid rgba(255,255,255,0.04)"
                  : "1px solid rgba(255,255,255,0.08)",
                padding: "16px 20px",
                cursor: completed ? "default" : "pointer",
                transition: "all 0.2s ease",
                opacity: completed ? 0.6 : 1,
              }}
            >
              <div>
                <div
                  className="font-body flex items-center gap-2"
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#f5f0e8",
                    marginBottom: "4px",
                  }}
                >
                  {p.creator === "You" ? "Your" : `${p.creator}'s`} puzzle
                  {completed && (
                    <span style={{ fontSize: "16px" }}>
                      {getMedalEmoji(
                        completed === "failed" ? null : completed,
                      )}
                    </span>
                  )}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  {formatDate(p.submittedAt)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {showComplexity && (
                  <div
                    className="font-mono rounded-md"
                    style={{
                      fontSize: "12px",
                      color: range.color,
                      background: range.bg,
                      padding: "4px 8px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {range.icon} {range.label}
                  </div>
                )}
                <div
                  className="font-mono rounded-md"
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,180,60,0.7)",
                    background: "rgba(255,180,60,0.08)",
                    padding: "4px 10px",
                    letterSpacing: "0.06em",
                  }}
                >
                  {p.word.length} letters
                </div>
                {!completed && (
                  <div
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      fontSize: "18px",
                    }}
                  >
                    ›
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <div
        className="w-full"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "20px",
          marginTop: "4px",
        }}
      >
        <button
          onClick={onSubmitWord}
          className="font-body w-full rounded-[10px]"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 24px",
            border: "1px dashed rgba(255,180,60,0.25)",
            background: "rgba(255,180,60,0.04)",
            color: "rgba(255,180,60,0.7)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            letterSpacing: "0.02em",
          }}
        >
          + Submit a word
        </button>
      </div>
    </div>
  );
}
