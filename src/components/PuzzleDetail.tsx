import { useState, useEffect } from "react";
import { getCreatorPuzzleStats } from "../lib/api";
import { getMedalEmoji, formatDate } from "../utils/scoring";
import ShareScreen from "./ShareScreen";
import type { Puzzle, PuzzleStats, DetailTab, CellStatus } from "../types";

// Tile colors for the solver guess grids (match the in-game tiles).
function cellColors(status: CellStatus | null) {
  if (status === "correct") return { bg: "#2d8a4e", color: "#ffffff", border: "1px solid #2d8a4e" };
  if (status === "present") return { bg: "#1a9e9e", color: "#ffffff", border: "1px solid #1a9e9e" };
  return { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" };
}

interface PuzzleDetailProps {
  puzzle: Puzzle;
  groups: Array<{ id: string; name: string; invite_code: string }>;
  /** True when the word has no shares and isn't public (the Share-tab dot). */
  notShared: boolean;
  /** New solvers since the creator last looked (the Results-tab dot). */
  newSolvers: number;
  initialTab: DetailTab;
  onPlay: () => void;
  /** Called after shares change so the parent can refresh creator data. */
  onShared: () => void;
}

export default function PuzzleDetail({
  puzzle,
  groups,
  notShared,
  newSolvers,
  initialTab,
  onPlay,
  onShared,
}: PuzzleDetailProps) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showLetters, setShowLetters] = useState<Set<string>>(new Set());

  const puzzleId = String(puzzle.id);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Viewing letters is a deliberate per-open action — reset to squares.
    setShowLetters((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleLetters = (id: string) => {
    setShowLetters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    getCreatorPuzzleStats(puzzleId).then((s) => {
      if (!active) return;
      setStats(s);
      setLoading(false);
    });
    return () => { active = false; };
  }, [puzzleId]);

  const solved = (stats?.solvers ?? []).filter((s) => s.medal !== null);
  const notSolved = (stats?.solvers ?? []).filter((s) => s.medal === null);
  const hasPlays = !!stats && stats.total_attempts > 0;
  const solveRate = hasPlays ? Math.round((stats.total_solved / stats.total_attempts) * 100) : 0;
  const maxDist = Math.max(1, ...Object.values(stats?.guess_distribution ?? {}).map(Number));

  const tabButton = (key: DetailTab, label: string, dot: boolean, dotColor: string) => {
    const activeTab = tab === key;
    return (
      <button
        onClick={() => setTab(key)}
        className="font-body flex-1 flex items-center justify-center rounded-lg"
        style={{
          gap: "6px",
          border: "none",
          padding: "9px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          background: activeTab ? "rgba(255,180,60,0.12)" : "transparent",
          color: activeTab ? "rgba(255,180,60,0.95)" : "rgba(255,255,255,0.5)",
        }}
      >
        {label}
        {dot && (
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        )}
      </button>
    );
  };

  const solverRow = (
    s: PuzzleStats["solvers"][number],
    failed: boolean,
  ) => {
    const isOpen = expanded.has(s.user_id);
    const lettersOn = showLetters.has(s.user_id);
    const grid = s.guesses ?? [];
    return (
      <div
        key={s.user_id}
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <button
          onClick={() => toggleExpand(s.user_id)}
          className="flex items-center justify-between w-full text-left"
          style={{ padding: "11px 14px", background: "none", border: "none", cursor: "pointer" }}
        >
          <div className="flex items-center min-w-0" style={{ gap: "10px" }}>
            <span
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: "30px",
                height: "30px",
                fontSize: "13px",
                fontWeight: 700,
                background: "rgba(255,180,60,0.1)",
                color: "rgba(255,180,60,0.7)",
              }}
            >
              {(s.display_name || s.username).charAt(0).toUpperCase()}
            </span>
            <span className="font-body truncate" style={{ fontSize: "14px", color: "#f5f0e8" }}>
              {s.display_name || s.username}
            </span>
          </div>
          <div className="flex items-center shrink-0" style={{ gap: "8px" }}>
            <span style={{ fontSize: "15px" }}>{failed ? "❌" : getMedalEmoji(s.medal)}</span>
            <span className="font-mono" style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
              {s.total_guesses}/6
            </span>
            <span
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.25)",
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
                display: "inline-block",
              }}
            >
              {"›"}
            </span>
          </div>
        </button>

        {isOpen && (
          <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                Their guesses
              </span>
              {grid.length > 0 && (
                <button
                  onClick={() => toggleLetters(s.user_id)}
                  className="font-body rounded-full"
                  style={{
                    padding: "3px 11px",
                    fontSize: "11px",
                    cursor: "pointer",
                    background: lettersOn ? "rgba(255,180,60,0.12)" : "rgba(255,255,255,0.04)",
                    border: lettersOn ? "1px solid rgba(255,180,60,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    color: lettersOn ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {lettersOn ? "Hide letters" : "Show letters"}
                </button>
              )}
            </div>

            {grid.length > 0 ? (
              <div className="flex flex-col items-center" style={{ gap: "4px" }}>
                {grid.map((row, ri) => (
                  <div key={ri} className="flex" style={{ gap: "4px" }}>
                    {row.result.map((cell, ci) => {
                      const c = cellColors(cell.status);
                      return (
                        <div
                          key={ci}
                          className="font-mono flex items-center justify-center rounded"
                          style={{
                            width: "24px",
                            height: "24px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: c.bg,
                            border: c.border,
                            color: c.color,
                          }}
                        >
                          {lettersOn ? cell.letter.toUpperCase() : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-body text-center" style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", padding: "6px" }}>
                Guess history not available for this attempt.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[480px] mx-auto" style={{ padding: "8px 20px 48px", animation: "fadeUp 0.35s ease" }}>
      {/* Word header */}
      <div className="text-center" style={{ marginBottom: "8px" }}>
        <div
          className="font-display"
          style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "0.06em", color: "#f5f0e8" }}
        >
          {puzzle.word.toUpperCase()}
        </div>
        <div className="font-body" style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "4px" }}>
          Your word · {formatDate(puzzle.submittedAt)}
        </div>
        {notShared && (
          <div
            className="inline-flex items-center"
            style={{
              gap: "5px",
              marginTop: "8px",
              background: "rgba(255,180,60,0.1)",
              border: "1px solid rgba(255,180,60,0.25)",
              borderRadius: "20px",
              padding: "3px 11px",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,140,40,0.9)" }} />
            <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: "10px", color: "rgba(255,180,60,0.9)" }}>
              Draft · not shared yet
            </span>
          </div>
        )}
      </div>

      {/* Definition */}
      {puzzle.definition && (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderLeft: "3px solid rgba(255,180,60,0.5)",
            borderRadius: "10px",
            padding: "12px 16px",
            margin: "14px 0 16px",
          }}
        >
          <div className="font-body italic" style={{ fontSize: "13px", lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>
            {puzzle.definition}
          </div>
        </div>
      )}

      {/* Play / test */}
      <button
        onClick={onPlay}
        className="font-body w-full rounded-[10px]"
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.03)",
          padding: "11px",
          fontSize: "13px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.6)",
          cursor: "pointer",
          marginBottom: "18px",
        }}
      >
        ▶ Play / test this word
      </button>

      {/* Tabs */}
      <div className="flex" style={{ gap: "4px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px", marginBottom: "18px" }}>
        {tabButton("results", "Results", newSolvers > 0, "rgba(255,180,60,0.95)")}
        {tabButton("share", "Share", notShared, "rgba(255,140,40,0.9)")}
      </div>

      {/* ===== Results pane ===== */}
      {tab === "results" && (
        <>
          {loading && (
            <div className="font-body text-center" style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", padding: "20px" }}>
              Loading results...
            </div>
          )}

          {!loading && !hasPlays && (
            <div
              className="text-center rounded-xl"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "12px",
                padding: "28px 16px",
              }}
            >
              <div style={{ fontSize: "30px", marginBottom: "8px" }}>🫥</div>
              <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                No guesses yet. {notShared ? "Share it" : "Once people play"} and the solvers will show up here.
              </div>
            </div>
          )}

          {!loading && hasPlays && (
            <>
              {/* Stat row */}
              <div
                className="flex items-center justify-center"
                style={{
                  gap: "16px",
                  padding: "14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  marginBottom: "14px",
                }}
              >
                {[
                  { v: `${solveRate}%`, l: "solve rate" },
                  { v: stats.avg_guesses ?? "—", l: "avg guesses" },
                  { v: stats.total_attempts, l: "played" },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <div className="font-mono" style={{ fontSize: "20px", fontWeight: 700, color: "#f5f0e8" }}>{s.v}</div>
                    <div className="font-body" style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Outcome legend */}
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  marginBottom: "18px",
                }}
              >
                <div className="font-body" style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                  <span style={{ whiteSpace: "nowrap" }}>🥇 solved</span> &nbsp;·&nbsp;
                  <span style={{ whiteSpace: "nowrap" }}>❌ didn't solve</span>
                </div>
              </div>

              {/* Distribution + solved list */}
              {solved.length > 0 && (
                <>
                  <div className="flex flex-col" style={{ gap: "5px", marginBottom: "16px" }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => {
                      const count = Number(stats.guess_distribution[String(n)] || 0);
                      const pct = (count / maxDist) * 100;
                      return (
                        <div key={n} className="flex items-center" style={{ gap: "8px" }}>
                          <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", width: "12px", textAlign: "right" }}>{n}</span>
                          <div className="flex-1 rounded-sm" style={{ height: "14px", background: "rgba(255,255,255,0.04)" }}>
                            <div className="h-full rounded-sm" style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, background: count > 0 ? "rgba(255,180,60,0.4)" : "transparent" }} />
                          </div>
                          <span className="font-mono" style={{ fontSize: "11px", color: count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)", width: "16px" }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: "10px", color: "rgba(255,180,60,0.55)", marginBottom: "10px" }}>
                    Solved
                  </div>
                  <div className="flex flex-col" style={{ gap: "8px" }}>
                    {solved.map((s) => solverRow(s, false))}
                  </div>
                </>
              )}

              {/* Didn't solve */}
              {notSolved.length > 0 && (
                <>
                  <div className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", margin: "18px 0 10px" }}>
                    Didn't solve
                  </div>
                  <div className="flex flex-col" style={{ gap: "8px" }}>
                    {notSolved.map((s) => solverRow(s, true))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ===== Share pane ===== */}
      {tab === "share" && (
        <>
          {notShared && (
            <div
              className="text-center"
              style={{
                border: "1px dashed rgba(255,180,60,0.3)",
                background: "rgba(255,180,60,0.05)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "14px",
              }}
            >
              <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: "3px" }}>
                Only you can see this word.
              </div>
              <div className="font-body" style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                Share it so people can start guessing.
              </div>
            </div>
          )}
          <ShareScreen
            embedded
            puzzle={puzzle}
            puzzleId={puzzleId}
            groups={groups}
            onDone={() => {}}
            onShared={onShared}
          />
        </>
      )}
    </div>
  );
}
