import { useState } from "react";
import type { Puzzle, CompletionStatus, PairStreak } from "../types";
import { getMedalEmoji, formatDate, getDifficultyTier } from "../utils/scoring";
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

  // Group unsolved puzzles by creator. The player's own words now live in the
  // My Words hub, so they're excluded here entirely.
  const groupMap = new Map<string, CreatorGroup>();

  for (const p of puzzles) {
    const cid = p.creator_id || "unknown";
    if (cid === user?.id) continue; // own words → My Words hub

    // Only show puzzles the player hasn't finished yet.
    if (completedPuzzles[p.id]) continue;

    let group = groupMap.get(cid);
    if (!group) {
      group = {
        creatorId: cid,
        creatorName: p.creator,
        puzzles: [],
        color: getCreatorColor(cid),
        streak: p.creator_id ? streaks[p.creator_id]?.current_streak || 0 : 0,
      };
      groupMap.set(cid, group);
    }
    group.puzzles.push(p);
  }

  const groups: CreatorGroup[] = [];
  groupMap.forEach((g) => groups.push(g));

  // Sort by puzzle count descending
  groups.sort((a, b) => b.puzzles.length - a.puzzles.length);

  // Max unsolved count across creators (for relative gradient scaling)
  const maxCount = Math.max(1, ...groups.map((g) => g.puzzles.length));

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
        Words others sent you. Trust your instincts.
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
        {groups.length === 0 && (
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

        {groups.map((group) => {
          const isExpanded = expanded.has(group.creatorId);
          const limit = getVisibleCount(group.creatorId);
          const visiblePuzzles = isExpanded
            ? group.puzzles.slice(0, limit)
            : [];
          const hasMore = isExpanded && group.puzzles.length > limit;
          const remaining = group.puzzles.length - limit;

          // Gradient width: relative to max count
          const fillPct = (group.puzzles.length / maxCount) * 100;

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
                        {"🔥"} {group.streak}
                      </span>
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
                      {"›"}
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
                    const tier = p.difficultyBreakdown ? getDifficultyTier(p.complexity) : null;

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
                          <span style={{ fontSize: "12px", opacity: 0.35 }}>
                            {p.isPublic ? "🌐" : "👤"}
                          </span>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "13px",
                              color: `rgba(${group.color},0.7)`,
                              letterSpacing: "0.06em",
                            }}
                          >
                            {isFinished && !p.word.startsWith("?")
                              ? p.word.toUpperCase()
                              : `${p.wordLength || p.word.length} letters`}
                          </span>
                          {tier && (
                            <span
                              title={`${tier.label} · difficulty ${p.complexity}`}
                              aria-label={tier.label}
                              style={{ fontSize: "12px", lineHeight: 1, flexShrink: 0 }}
                            >
                              {tier.icon}
                            </span>
                          )}
                          {isFinished && (
                            <span style={{ fontSize: "14px" }}>
                              {getMedalEmoji(
                                status === "failed" ? null : status,
                              )}
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
                              {"›"}
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
      </div>
    </div>
  );
}
