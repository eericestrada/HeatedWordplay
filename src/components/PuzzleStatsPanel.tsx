import { useState, useEffect } from "react";
import { getPuzzleStats } from "../lib/api";
import { getMedalEmoji } from "../utils/scoring";
import { useAuth } from "../contexts/AuthContext";
import type { PuzzleStats } from "../types";

interface PuzzleStatsPanelProps {
  puzzleId: string;
  groupId: string | null;
}

export default function PuzzleStatsPanel({ puzzleId, groupId }: PuzzleStatsPanelProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    getPuzzleStats(puzzleId, groupId).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [puzzleId, groupId]);

  if (loading || !stats || stats.total_attempts === 0) return null;

  const solveRate = Math.round((stats.total_solved / stats.total_attempts) * 100);

  // Find current user's rank among solvers
  const userRank = stats.solvers.findIndex((s) => s.user_id === user?.id) + 1;
  const maxGuesses = Math.max(
    ...Object.values(stats.guess_distribution).map(Number),
    1,
  );

  return (
    <div
      className="w-full rounded-xl"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 20px",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.12em]"
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.35)",
          marginBottom: "12px",
        }}
      >
        Group Stats
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div
              className="font-mono"
              style={{ fontSize: "20px", fontWeight: 700, color: "#f5f0e8" }}
            >
              {solveRate}%
            </div>
            <div
              className="font-body"
              style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}
            >
              solve rate
            </div>
          </div>
          <div className="text-center">
            <div
              className="font-mono"
              style={{ fontSize: "20px", fontWeight: 700, color: "#f5f0e8" }}
            >
              {stats.avg_guesses ?? "—"}
            </div>
            <div
              className="font-body"
              style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}
            >
              avg guesses
            </div>
          </div>
          <div className="text-center">
            <div
              className="font-mono"
              style={{ fontSize: "20px", fontWeight: 700, color: "#f5f0e8" }}
            >
              {stats.total_attempts}
            </div>
            <div
              className="font-body"
              style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}
            >
              played
            </div>
          </div>
        </div>
        {userRank > 0 && (
          <div
            className="font-mono rounded-md text-center"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "rgba(255,180,60,0.9)",
              background: "rgba(255,180,60,0.1)",
              padding: "4px 10px",
              border: "1px solid rgba(255,180,60,0.15)",
            }}
          >
            #{userRank} of {stats.solvers.length}
          </div>
        )}
      </div>

      {/* Guess distribution */}
      <div className="flex flex-col gap-1" style={{ marginBottom: "12px" }}>
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const count = stats.guess_distribution[String(n)] || 0;
          const pct = maxGuesses > 0 ? (count / maxGuesses) * 100 : 0;
          return (
            <div key={n} className="flex items-center gap-2">
              <div
                className="font-mono shrink-0"
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.3)",
                  width: "12px",
                  textAlign: "right",
                }}
              >
                {n}
              </div>
              <div
                className="flex-1 rounded-sm"
                style={{
                  height: "14px",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                    background: count > 0
                      ? "rgba(255,180,60,0.4)"
                      : "transparent",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div
                className="font-mono shrink-0"
                style={{
                  fontSize: "11px",
                  color: count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                  width: "16px",
                }}
              >
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Solver list */}
      {stats.solvers.length > 0 && (
        <div className="flex flex-col gap-1">
          {stats.solvers.slice(0, 6).map((s, i) => (
            <div
              key={s.user_id}
              className="flex items-center justify-between"
              style={{
                padding: "4px 0",
                opacity: s.user_id === user?.id ? 1 : 0.7,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="font-mono shrink-0"
                  style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", width: "16px" }}
                >
                  {i + 1}.
                </span>
                <span
                  className="font-body truncate"
                  style={{
                    fontSize: "13px",
                    color: s.user_id === user?.id ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.6)",
                    fontWeight: s.user_id === user?.id ? 600 : 400,
                  }}
                >
                  {s.display_name || s.username}
                  {s.user_id === user?.id && " (you)"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span style={{ fontSize: "13px" }}>
                  {getMedalEmoji(s.medal)}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}
                >
                  {s.total_guesses}/6
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
