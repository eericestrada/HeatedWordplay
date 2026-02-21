import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getPlayerStats, getCreatorStats } from "../lib/api";
import { getMedalEmoji } from "../utils/scoring";
import type { PlayerStats, CreatorStats } from "../types";

interface StatsScreenProps {
  onBack: () => void;
}

export default function StatsScreen({ onBack }: StatsScreenProps) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"career" | "words">("career");
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      getPlayerStats(profile.id),
      getCreatorStats(profile.id),
    ]).then(([ps, cs]) => {
      setPlayerStats(ps);
      setCreatorStats(cs);
      setLoading(false);
    });
  }, [profile]);

  const statBox = (label: string, value: string | number, highlight = false) => (
    <div
      className="rounded-lg text-center"
      style={{
        background: highlight ? "rgba(255,180,60,0.08)" : "rgba(255,255,255,0.03)",
        border: highlight ? "1px solid rgba(255,180,60,0.15)" : "1px solid rgba(255,255,255,0.05)",
        padding: "12px 8px",
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: highlight ? "rgba(255,180,60,0.95)" : "#f5f0e8",
        }}
      >
        {value}
      </div>
      <div
        className="font-body"
        style={{
          fontSize: "10px",
          color: highlight ? "rgba(255,180,60,0.6)" : "rgba(255,255,255,0.3)",
          marginTop: "2px",
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[420px] mx-auto"
      style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
    >
      <button
        onClick={onBack}
        className="self-start font-body"
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.35)",
          fontSize: "14px",
          cursor: "pointer",
        }}
      >
        ← Back
      </button>

      <div style={{ fontSize: "36px", lineHeight: 1 }}>📊</div>
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Your Stats
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.03)", padding: "3px" }}>
        {(["career", "words"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="font-body flex-1 rounded-md"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              padding: "8px 12px",
              border: "none",
              background: tab === t ? "rgba(255,180,60,0.12)" : "transparent",
              color: tab === t ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.35)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {t === "career" ? "My Career" : "My Words"}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          className="font-body"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
        >
          Loading stats...
        </div>
      ) : tab === "career" && playerStats ? (
        <>
          {/* Main stats grid */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {statBox("Total Score", playerStats.total_score, true)}
            {statBox("Solved", playerStats.total_solved)}
            {statBox("Solve Rate", playerStats.total_attempted > 0
              ? `${Math.round((playerStats.total_solved / playerStats.total_attempted) * 100)}%`
              : "—")}
          </div>

          {/* Medal row */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {statBox(`${getMedalEmoji("gold")} Gold`, playerStats.gold_count)}
            {statBox(`${getMedalEmoji("silver")} Silver`, playerStats.silver_count)}
            {statBox(`${getMedalEmoji("bronze")} Bronze`, playerStats.bronze_count)}
          </div>

          {/* Additional stats */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {statBox("Avg Guesses", playerStats.avg_guesses ?? "—")}
            {statBox("Best Score", playerStats.best_score)}
            {statBox("Daily Streak", playerStats.current_solve_streak > 0
              ? `🔥 ${playerStats.current_solve_streak}`
              : "0")}
          </div>

          {/* Creator summary */}
          <div
            className="w-full rounded-lg"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              padding: "14px 16px",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                Puzzles created
              </div>
              <div className="font-mono" style={{ fontSize: "15px", fontWeight: 600, color: "#f5f0e8" }}>
                {playerStats.puzzles_created}
              </div>
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: "6px" }}>
              <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                Played by others
              </div>
              <div className="font-mono" style={{ fontSize: "15px", fontWeight: 600, color: "#f5f0e8" }}>
                {playerStats.puzzles_played_by_others}
              </div>
            </div>
          </div>
        </>
      ) : tab === "words" && creatorStats ? (
        <>
          {/* Creator overview */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {statBox("Words", creatorStats.total_puzzles)}
            {statBox("Plays", creatorStats.total_plays)}
            {statBox("Stump Rate", creatorStats.total_plays > 0
              ? `${creatorStats.stump_rate}%`
              : "—")}
          </div>

          <div className="grid grid-cols-3 gap-2 w-full">
            {statBox("Solved", creatorStats.total_solves)}
            {statBox("Failed", creatorStats.total_fails)}
            {statBox("Avg Guesses", creatorStats.avg_guesses ?? "—")}
          </div>

          {/* Per-puzzle breakdown */}
          {creatorStats.puzzles.length > 0 && (
            <div className="flex flex-col gap-1.5 w-full">
              <div
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.3)",
                  marginTop: "4px",
                }}
              >
                Your Puzzles
              </div>
              {creatorStats.puzzles.map((p) => {
                const solveRate = p.play_count > 0
                  ? Math.round((p.solve_count / p.play_count) * 100)
                  : null;
                return (
                  <div
                    key={p.puzzle_id}
                    className="flex items-center justify-between rounded-lg"
                    style={{
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div className="min-w-0">
                      <div
                        className="font-display truncate"
                        style={{
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "#f5f0e8",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {p.word.toUpperCase()}
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
                      >
                        {p.play_count} play{p.play_count !== 1 ? "s" : ""}
                        {p.avg_guesses && ` · ${p.avg_guesses} avg`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {p.play_count > 0 ? (
                        <div
                          className="font-mono"
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: solveRate !== null && solveRate < 50
                              ? "rgba(255,100,100,0.8)"
                              : "rgba(45,138,78,0.8)",
                          }}
                        >
                          {solveRate}%
                        </div>
                      ) : (
                        <div
                          className="font-mono"
                          style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}
                        >
                          no plays
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {creatorStats.total_puzzles === 0 && (
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
              You haven't submitted any words yet. Create a puzzle to see how others perform!
            </div>
          )}
        </>
      ) : (
        <div
          className="font-body"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
        >
          No stats available yet.
        </div>
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        className="font-body w-full rounded-lg"
        style={{
          fontSize: "14px",
          fontWeight: 600,
          padding: "12px 24px",
          border: "1px solid rgba(255,180,60,0.25)",
          background: "rgba(255,180,60,0.08)",
          color: "rgba(255,180,60,0.8)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          marginTop: "4px",
        }}
      >
        Back to puzzles
      </button>
    </div>
  );
}
