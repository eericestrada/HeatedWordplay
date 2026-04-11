import { useState } from "react";
import type { Puzzle, CompletionStatus, PairStreak } from "../types";
import { getMedalEmoji, formatDate } from "../utils/scoring";
import { useAuth } from "../contexts/AuthContext";

interface PuzzleSelectorProps {
  puzzles: Puzzle[];
  completedPuzzles: Record<string | number, CompletionStatus>;
  streaks?: Record<string, PairStreak>;
  onSelect: (puzzle: Puzzle) => void;
  onReview?: (puzzle: Puzzle) => void;
  onSubmitWord: () => void;
}

// Warm palette tuned for dark backgrounds, inspired by Fizzy's color system
const CREATOR_COLORS = [
  "255,180,60",   // amber
  "26,158,158",   // teal
  "180,120,255",  // violet
  "255,120,150",  // rose
  "120,200,80",   // lime
  "100,180,255",  // sky
  "255,150,100",  // coral
  "200,160,255",  // lavender
  "255,210,80",   // gold
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getCreatorColor(creatorId: string): string {
  return CREATOR_COLORS[hashString(creatorId) % CREATOR_COLORS.length];
}

const INITIAL_SHOW = 3;
const SHOW_MORE_STEP = 5;

interface CreatorGroup {
  creatorId: string;
  creatorName: string;
  puzzles: Puzzle[];
  isOwn: boolean;
  color: string;
  streak: number;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCount, setShowCount] = useState<Record<string, number>>({});
  const [hideOwn, setHideOwn] = useState(() => {
    try {
      return localStorage.getItem("hw-hide-own") === "true";
    } catch {
      return false;
    }
  });

  // Group puzzles by creator
  const groupMap = new Map<string, CreatorGroup>();

  for (const p of puzzles) {
    const cid = p.creator_id || "unknown";
    const isOwn = cid === user?.id;

    // For others: only unsolved puzzles. For own: all submissions.
    if (!isOwn) {
      const status = completedPuzzles[p.id];
      if (status && status !== "submitted") continue;
    }

    let group = groupMap.get(cid);
    if (!group) {
      group = {
        creatorId: cid,
        creatorName: isOwn ? "You" : p.creator,
        puzzles: [],
        isOwn,
        color: getCreatorColor(cid),
        streak: !isOwn && p.creator_id ? streaks[p.creator_id]?.current_streak || 0 : 0,
      };
      groupMap.set(cid, group);
    }
    group.puzzles.push(p);
  }

  const groups: CreatorGroup[] = [];
  groupMap.forEach((g) => groups.push(g));

  // Sort others by puzzle count descending, own row at the end
  groups.sort((a, b) => {
    if (a.isOwn) return 1;
    if (b.isOwn) return -1;
    return b.puzzles.length - a.puzzles.length;
  });

  // Max unsolved count across other creators (for relative gradient scaling)
  const maxCount = Math.max(
    1,
    ...groups.filter((g) => !g.isOwn).map((g) => g.puzzles.length),
  );

  const toggleExpand = (creatorId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else next.add(creatorId);
      return next;
    });
  };

  const getVisibleCount = (creatorId: string) =>
    showCount[creatorId] || INITIAL_SHOW;

  const showMore = (creatorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCount((prev) => ({
      ...prev,
      [creatorId]: (prev[creatorId] || INITIAL_SHOW) + SHOW_MORE_STEP,
    }));
  };

  const toggleHideOwn = () => {
    const next = !hideOwn;
    setHideOwn(next);
    try {
      localStorage.setItem("hw-hide-own", String(next));
    } catch {
      // ignore
    }
  };

  // Own group reference (may not exist if user has no submissions)
  const ownGroup = groups.find((g) => g.isOwn);

  // Visible groups: hide own if toggled
  const visibleGroups = groups.filter((g) => !(g.isOwn && hideOwn));

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

      {/* Send a Word */}
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

      {/* Creator rows */}
      <div className="flex flex-col gap-2.5 w-full">
        {visibleGroups.length === 0 && !hideOwn && (
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
            You've handled everything they've given you. Make the next move.
          </div>
        )}

        {visibleGroups.map((group) => {
          const isExpanded = expanded.has(group.creatorId);
          const limit = getVisibleCount(group.creatorId);
          const visiblePuzzles = isExpanded
            ? group.puzzles.slice(0, limit)
            : [];
          const hasMore = isExpanded && group.puzzles.length > limit;
          const remaining = group.puzzles.length - limit;

          // Gradient width: relative to max count
          const fillPct = group.isOwn
            ? Math.min(
                100,
                (group.puzzles.length /
                  Math.max(maxCount, group.puzzles.length)) *
                  100,
              )
            : (group.puzzles.length / maxCount) * 100;

          return (
            <div
              key={group.creatorId}
              className="rounded-[10px] overflow-hidden"
              style={{
                border: `1px solid rgba(${group.color},${isExpanded ? 0.2 : 0.12})`,
                transition: "border-color 0.25s ease",
              }}
            >
              {/* Row header with gradient */}
              <button
                onClick={() => toggleExpand(group.creatorId)}
                className="w-full text-left relative"
                style={{
                  padding: "16px 20px",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.02)",
                  border: "none",
                  overflow: "hidden",
                }}
              >
                {/* Fizzy-inspired gradient fill */}
                <div
                  className="absolute inset-y-0 left-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to right, rgba(${group.color},0.18) 0%, rgba(${group.color},0.06) 60%, transparent 100%)`,
                    width: `${Math.max(fillPct, 12)}%`,
                    transition: "width 0.5s ease",
                  }}
                />

                {/* Content over gradient */}
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-body"
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#f5f0e8",
                      }}
                    >
                      {group.creatorName}
                    </span>
                    {group.streak > 0 && (
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
                        {"\uD83D\uDD25"} {group.streak}
                      </span>
                    )}
                    {group.isOwn && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHideOwn();
                        }}
                        className="font-mono"
                        style={{
                          fontSize: "10px",
                          color: "rgba(255,255,255,0.25)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        hide
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: `rgba(${group.color},0.8)`,
                      }}
                    >
                      {group.puzzles.length}
                    </span>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        fontSize: "18px",
                        transform: isExpanded
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                        display: "inline-block",
                      }}
                    >
                      {"\u203A"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded puzzle list */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: `1px solid rgba(${group.color},0.1)`,
                    background: "rgba(0,0,0,0.15)",
                  }}
                >
                  {visiblePuzzles.map((p) => {
                    const status = completedPuzzles[p.id];
                    const isFinished = status && status !== "submitted";
                    const isOwnPuzzle = status === "submitted";

                    const handleClick = () => {
                      if (isFinished && onReview) {
                        onReview(p);
                      } else {
                        onSelect(p);
                      }
                    };

                    return (
                      <button
                        key={p.id}
                        onClick={handleClick}
                        className="flex items-center justify-between w-full text-left"
                        style={{
                          padding: "12px 20px",
                          cursor: "pointer",
                          background: "transparent",
                          border: "none",
                          borderBottom: `1px solid rgba(${group.color},0.05)`,
                          transition: "background 0.15s ease",
                          opacity: isFinished ? 0.6 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {!group.isOwn && (
                            <span style={{ fontSize: "12px", opacity: 0.35 }}>
                              {p.isPublic ? "\uD83C\uDF10" : "\uD83D\uDC64"}
                            </span>
                          )}
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "13px",
                              color: `rgba(${group.color},0.7)`,
                              letterSpacing: "0.06em",
                            }}
                          >
                            {(isFinished || isOwnPuzzle) &&
                            !p.word.startsWith("?")
                              ? p.word.toUpperCase()
                              : `${p.wordLength || p.word.length} letters`}
                          </span>
                          {isFinished && (
                            <span style={{ fontSize: "14px" }}>
                              {getMedalEmoji(
                                status === "failed" ? null : status,
                              )}
                            </span>
                          )}
                          {isOwnPuzzle && !p.hasAttempted && (
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
                          {isOwnPuzzle && p.hasAttempted && (
                            <span
                              style={{
                                fontSize: "14px",
                                color: "rgba(26,158,158,0.6)",
                              }}
                            >
                              {"\u2713"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.25)",
                            }}
                          >
                            {formatDate(p.submittedAt)}
                          </span>
                          {isFinished ? (
                            <span
                              className="font-mono"
                              style={{
                                color: "rgba(255,180,60,0.6)",
                                background: "rgba(255,180,60,0.06)",
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                              }}
                            >
                              View results
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "rgba(255,255,255,0.2)",
                                fontSize: "18px",
                              }}
                            >
                              {"\u203A"}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* See more */}
                  {hasMore && (
                    <button
                      onClick={(e) => showMore(group.creatorId, e)}
                      className="font-body w-full text-center"
                      style={{
                        padding: "10px 20px",
                        fontSize: "13px",
                        color: `rgba(${group.color},0.6)`,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      See more ({remaining} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Show own words link when hidden */}
        {hideOwn && ownGroup && (
          <button
            onClick={toggleHideOwn}
            className="font-mono text-left"
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.2)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
            }}
          >
            Show my words ({ownGroup.puzzles.length})
          </button>
        )}
      </div>
    </div>
  );
}
