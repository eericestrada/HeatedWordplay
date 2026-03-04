import { useState } from "react";
import type { Puzzle, CompletionStatus, PairStreak } from "../types";
import {
  getMedalEmoji,
  getComplexityRange,
  formatDate,
} from "../utils/scoring";
import { useAuth } from "../contexts/AuthContext";

interface PuzzleSelectorProps {
  puzzles: Puzzle[];
  completedPuzzles: Record<string | number, CompletionStatus>;
  streaks?: Record<string, PairStreak>;
  onSelect: (puzzle: Puzzle) => void;
  onReview?: (puzzle: Puzzle) => void;
  onSubmitWord: () => void;
}

export default function PuzzleSelector({
  puzzles,
  completedPuzzles,
  streaks = {},
  onSelect,
  onReview,
  onSubmitWord,
}: PuzzleSelectorProps) {
  const { user } = useAuth();
  const [showComplexity, setShowComplexity] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(() => {
    try {
      return localStorage.getItem("hw-hide-completed") === "true";
    } catch {
      return false;
    }
  });
  const [hideOwn, setHideOwn] = useState(() => {
    try {
      return localStorage.getItem("hw-hide-own") === "true";
    } catch {
      return false;
    }
  });

  const toggleHideCompleted = () => {
    const next = !hideCompleted;
    setHideCompleted(next);
    try {
      localStorage.setItem("hw-hide-completed", String(next));
    } catch {
      // Ignore storage errors
    }
  };

  const toggleHideOwn = () => {
    const next = !hideOwn;
    setHideOwn(next);
    try {
      localStorage.setItem("hw-hide-own", String(next));
    } catch {
      // Ignore storage errors
    }
  };

  // Count completed puzzles (excluding own "submitted" puzzles)
  const completedCount = puzzles.filter((p) => {
    const s = completedPuzzles[p.id];
    return s && s !== "submitted";
  }).length;

  // Count own puzzles
  const ownCount = puzzles.filter((p) => p.creator_id === user?.id).length;

  // Filter puzzles based on toggles
  const visiblePuzzles = puzzles.filter((p) => {
    const s = completedPuzzles[p.id];
    if (hideCompleted && s && s !== "submitted") return false;
    if (hideOwn && p.creator_id === user?.id) return false;
    return true;
  });

  // Helper: mini toggle component
  const Toggle = ({
    active,
    onClick,
    label,
    activeColor = "rgba(26,158,158,",
  }: {
    active: boolean;
    onClick: () => void;
    label: string;
    activeColor?: string;
  }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px 0",
      }}
    >
      <div
        className="relative rounded-[10px]"
        style={{
          width: "32px",
          height: "18px",
          background: active
            ? `${activeColor}0.35)`
            : "rgba(255,255,255,0.1)",
          transition: "background 0.2s ease",
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: "14px",
            height: "14px",
            background: active
              ? `${activeColor}0.9)`
              : "rgba(255,255,255,0.35)",
            top: "2px",
            left: active ? "16px" : "2px",
            transition: "all 0.2s ease",
          }}
        />
      </div>
      <span
        className="font-body"
        style={{
          fontSize: "12px",
          color: active
            ? `${activeColor}0.7)`
            : "rgba(255,255,255,0.35)",
          transition: "color 0.2s ease",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );

  return (
    <div
      className="flex flex-col items-center gap-6 max-w-[480px] mx-auto"
      style={{ padding: "32px 20px" }}
    >
      <div
        className="font-display text-center"
        style={{ fontSize: "28px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Friendlies
      </div>
      <div
        className="font-body text-center"
        style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
      >
        Select a word to guess. Trust your instincts.
      </div>

      {/* Send a Word — above the puzzle list */}
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
        + Send a Word
      </button>

      {/* Filter toggles */}
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <Toggle
          active={showComplexity}
          onClick={() => setShowComplexity(!showComplexity)}
          label="Complexity"
          activeColor="rgba(255,180,60,"
        />
        {completedCount > 0 && (
          <Toggle
            active={hideCompleted}
            onClick={toggleHideCompleted}
            label={`Hide done (${completedCount})`}
          />
        )}
        {ownCount > 0 && (
          <Toggle
            active={hideOwn}
            onClick={toggleHideOwn}
            label={`Hide mine (${ownCount})`}
          />
        )}
      </div>

      {/* Puzzle list */}
      <div className="flex flex-col gap-2.5 w-full">
        {visiblePuzzles.length === 0 && (
          <div
            className="font-body text-center rounded-lg"
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.02)",
              padding: "24px 16px",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {hideCompleted || hideOwn
              ? "All puzzles hidden by filters. Adjust the toggles above."
              : "You've handled everything they've given you. Make the next move."}
          </div>
        )}
        {visiblePuzzles.map((p) => {
          const completed = completedPuzzles[p.id];
          const range = getComplexityRange(p.complexity);
          const isFinished = completed && completed !== "submitted";
          const isOwn = completed === "submitted";
          const creatorStreak = p.creator_id ? streaks[p.creator_id]?.current_streak || 0 : 0;

          const handleClick = () => {
            if (isFinished && onReview) {
              onReview(p);
            } else if (!isFinished || isOwn) {
              onSelect(p);
            }
          };

          return (
            <button
              key={p.id}
              onClick={handleClick}
              className="flex items-center justify-between rounded-[10px] text-left"
              style={{
                background: isFinished
                  ? "rgba(255,255,255,0.01)"
                  : "rgba(255,255,255,0.03)",
                border: isFinished
                  ? "1px solid rgba(255,255,255,0.04)"
                  : "1px solid rgba(255,255,255,0.08)",
                padding: "16px 20px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                opacity: isFinished ? 0.6 : 1,
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
                  {!isOwn && (
                    <span style={{ fontSize: "12px", opacity: 0.35 }}>
                      {p.isPublic ? "🌐" : "👤"}
                    </span>
                  )}
                  {p.creator === "You" ? "You" : p.creator}
                  {isFinished && (
                    <span style={{ fontSize: "16px" }}>
                      {getMedalEmoji(
                        completed === "failed" ? null : completed,
                      )}
                    </span>
                  )}
                  {isOwn && !p.hasAttempted && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "10px",
                        color: "rgba(26,158,158,0.7)",
                        background: "rgba(26,158,158,0.1)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      Test it
                    </span>
                  )}
                  {isOwn && p.hasAttempted && (
                    <span style={{ fontSize: "14px", color: "rgba(26,158,158,0.6)" }}>
                      ✓
                    </span>
                  )}
                  {creatorStreak > 0 && !isOwn && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "10px",
                        color: "rgba(255,140,40,0.85)",
                        background: "rgba(255,140,40,0.1)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: 600,
                      }}
                    >
                      🔥 {creatorStreak}
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
                    color: isFinished || isOwn
                      ? "rgba(255,255,255,0.5)"
                      : "rgba(255,180,60,0.7)",
                    background: isFinished || isOwn
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(255,180,60,0.08)",
                    padding: "4px 10px",
                    letterSpacing: "0.06em",
                  }}
                >
                  {(isFinished || isOwn) && !p.word.startsWith("?")
                    ? p.word.toUpperCase()
                    : `${p.word.length} letters`}
                </div>
                {isFinished ? (
                  <div
                    className="font-mono rounded-md"
                    style={{
                      color: "rgba(255,180,60,0.6)",
                      background: "rgba(255,180,60,0.06)",
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    View results
                  </div>
                ) : (
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


    </div>
  );
}
