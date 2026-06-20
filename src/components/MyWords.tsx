import { useState } from "react";
import { formatDate, getDifficultyTier } from "../utils/scoring";
import { markSeen } from "../utils/myWords";
import Pantheon from "./Pantheon";
import type { Puzzle } from "../types";
import type { MyWordRow } from "../utils/myWords";

interface MyWordsProps {
  rows: MyWordRow[];
  puzzles: Puzzle[];
  loading: boolean;
  onOpenPuzzle: (puzzle: Puzzle) => void;
  onShareDraft: (puzzle: Puzzle) => void;
  onCreateNew: () => void;
}

type View = "words" | "pantheon";
type SortKey = "date" | "avg" | "difficulty";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date added" },
  { key: "avg", label: "Avg tries" },
  { key: "difficulty", label: "Difficulty" },
];

// Tier filter chips — keys match getDifficultyTier().label; "all" clears the filter.
const TIER_CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Cake", label: "🍰" },
  { key: "Easy", label: "✦" },
  { key: "Medium", label: "⚡" },
  { key: "Hard", label: "🔥" },
  { key: "Nightmare", label: "💀" },
];

export default function MyWords({
  rows,
  puzzles,
  loading,
  onOpenPuzzle,
  onShareDraft,
  onCreateNew,
}: MyWordsProps) {
  const [view, setView] = useState<View>("words");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<Record<SortKey, "asc" | "desc">>({
    date: "desc",
    avg: "desc",
    difficulty: "desc",
  });
  const [tier, setTier] = useState<string>("all");

  // Resolve the full Puzzle for navigation (own puzzles are always present in
  // the loaded list, but fall back to a minimal object just in case).
  const resolvePuzzle = (row: MyWordRow): Puzzle => {
    const found = puzzles.find((p) => String(p.id) === row.puzzleId);
    if (found) return found;
    return {
      id: row.puzzleId,
      word: row.word,
      creator: "You",
      definition: "",
      clue: null,
      context: null,
      complexity: row.complexity,
      submittedAt: row.createdAt.split("T")[0],
      wordLength: row.word.length,
      isPublic: row.isPublic,
    };
  };

  // A row's difficulty tier — only v1-scored words (with a breakdown) get one,
  // consistent with the per-row tier icons elsewhere; legacy words return null.
  const tierOf = (row: MyWordRow) => {
    const found = puzzles.find((p) => String(p.id) === row.puzzleId);
    return found?.difficultyBreakdown ? getDifficultyTier(row.complexity) : null;
  };

  const openShared = (row: MyWordRow) => {
    markSeen(row.puzzleId, row.solves);
    onOpenPuzzle(resolvePuzzle(row));
  };

  // Open a word's detail by id (used by the Pantheon, which only knows ids).
  const openById = (puzzleId: string) => {
    const found = puzzles.find((p) => String(p.id) === puzzleId);
    if (found) onOpenPuzzle(found);
  };

  const pickSort = (key: SortKey) => {
    if (sort === key) {
      setDir((d) => ({ ...d, [key]: d[key] === "desc" ? "asc" : "desc" }));
    } else {
      setSort(key);
    }
  };

  const drafts = rows.filter((r) => r.isDraft);
  const active = rows.filter((r) => !r.isDraft);

  // Shared list — tier filter, then sort in the chosen direction.
  const filtered = tier === "all" ? active : active.filter((r) => tierOf(r)?.label === tier);
  const d = dir[sort] === "desc" ? -1 : 1;
  const sortVal = (r: MyWordRow) =>
    sort === "date"
      ? new Date(r.createdAt).getTime()
      : sort === "avg"
        ? r.avgGuesses ?? -1
        : r.complexity;
  const shared = [...filtered].sort((a, b) => (sortVal(a) - sortVal(b)) * d);

  const sortNote = {
    date: dir.date === "desc" ? "newest first" : "oldest first",
    avg: dir.avg === "desc" ? "hardest to solve first" : "easiest to solve first",
    difficulty: dir.difficulty === "desc" ? "toughest tier first" : "easiest tier first",
  }[sort];

  // ── Segmented view toggle ──
  const segColor = (on: boolean) => (on ? "rgba(255,180,60,0.95)" : "rgba(255,255,255,0.45)");
  const segBg = (on: boolean) => (on ? "rgba(255,180,60,0.14)" : "transparent");
  const segBtn = (label: string, onClick: () => void, on: boolean) => (
    <button
      onClick={onClick}
      className="hwbtn font-body flex-1 rounded-lg"
      style={{
        border: "none",
        padding: "10px 6px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        background: segBg(on),
        color: segColor(on),
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-[480px] mx-auto" style={{ padding: "8px 20px 40px", animation: "fadeUp 0.35s ease" }}>
      <div className="font-display" style={{ fontSize: "26px", fontWeight: 700, color: "#f5f0e8", marginBottom: "14px" }}>
        Your words
      </div>

      {/* View toggle: + New (routes to create) · My Words · Pantheon */}
      <div
        className="flex"
        style={{ gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "11px", padding: "4px", marginBottom: "18px" }}
      >
        {segBtn("+ New", onCreateNew, false)}
        {segBtn("My Words", () => setView("words"), view === "words")}
        {segBtn("🏛️ Pantheon", () => setView("pantheon"), view === "pantheon")}
      </div>

      {view === "pantheon" ? (
        <Pantheon onOpenPuzzle={openById} />
      ) : (
        <>
          {loading && rows.length === 0 && (
            <div className="font-body text-center" style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", padding: "20px" }}>
              Loading your words...
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div
              className="font-body text-center rounded-xl"
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                padding: "28px 16px",
              }}
            >
              You haven't created any words yet. Tap{" "}
              <span style={{ color: "rgba(255,180,60,0.8)" }}>+ New</span> to make one and share it —
              then watch who tries to crack it.
            </div>
          )}

          {/* Drafts — private until shared */}
          {drafts.length > 0 && (
            <>
              <div
                className="font-mono uppercase tracking-[0.12em]"
                style={{ fontSize: "10px", color: "rgba(255,140,40,0.65)", marginBottom: "10px" }}
              >
                Drafts · only you can see these
              </div>
              <div className="flex flex-col" style={{ gap: "9px", marginBottom: "24px" }}>
                {drafts.map((row) => {
                  const puzzle = resolvePuzzle(row);
                  const tierBadge = tierOf(row);
                  return (
                    <div
                      key={row.puzzleId}
                      className="flex items-center"
                      style={{
                        gap: "12px",
                        border: "1px dashed rgba(255,180,60,0.3)",
                        background: "rgba(255,180,60,0.04)",
                        borderRadius: "12px",
                        padding: "13px 15px",
                      }}
                    >
                      <button
                        onClick={() => onShareDraft(puzzle)}
                        className="font-body flex-1 min-w-0 text-left"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <span
                          className="font-display"
                          style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "0.05em", color: "#f5f0e8" }}
                        >
                          {row.word.toUpperCase()}
                        </span>
                        <div className="font-body" style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                          Draft · {formatDate(row.createdAt.split("T")[0])}
                          {tierBadge && ` · ${tierBadge.icon} ${tierBadge.label}`}
                        </div>
                      </button>
                      <button
                        onClick={() => onShareDraft(puzzle)}
                        className="font-body shrink-0 rounded-lg"
                        style={{
                          padding: "8px 15px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "rgba(255,180,60,0.12)",
                          border: "1px solid rgba(255,180,60,0.3)",
                          color: "rgba(255,180,60,0.9)",
                        }}
                      >
                        Share
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Sort + tier filter (apply to Shared) */}
          {active.length > 0 && (
            <>
              <div className="flex items-center" style={{ gap: "7px", marginBottom: "10px", flexWrap: "wrap" }}>
                <span className="font-mono uppercase" style={{ fontSize: "9px", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>
                  Sort
                </span>
                {SORTS.map((s) => {
                  const on = sort === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => pickSort(s.key)}
                      className="hwbtn font-body flex items-center"
                      style={{
                        borderRadius: "20px",
                        padding: "5px 11px",
                        fontSize: "11px",
                        fontWeight: 500,
                        gap: "4px",
                        cursor: "pointer",
                        background: on ? "rgba(255,180,60,0.14)" : "rgba(255,255,255,0.03)",
                        border: on ? "1px solid rgba(255,180,60,0.35)" : "1px solid rgba(255,255,255,0.08)",
                        color: on ? "rgba(255,180,60,0.95)" : "rgba(255,255,255,0.55)",
                      }}
                    >
                      {s.label}
                      {on && <span style={{ fontSize: "9px" }}>{dir[s.key] === "desc" ? "↓" : "↑"}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center" style={{ gap: "6px", marginBottom: "18px", flexWrap: "wrap" }}>
                <span className="font-mono uppercase" style={{ fontSize: "9px", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>
                  Tier
                </span>
                {TIER_CHIPS.map((t) => {
                  const on = tier === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTier(t.key)}
                      className="hwbtn font-body"
                      style={{
                        borderRadius: "20px",
                        padding: "5px 10px",
                        fontSize: "11px",
                        cursor: "pointer",
                        background: on ? "rgba(255,180,60,0.14)" : "rgba(255,255,255,0.03)",
                        border: on ? "1px solid rgba(255,180,60,0.35)" : "1px solid rgba(255,255,255,0.08)",
                        color: on ? "rgba(255,180,60,0.95)" : "rgba(255,255,255,0.55)",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Shared / live words */}
              <div className="flex items-center justify-between" style={{ marginBottom: "9px" }}>
                <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
                  Shared · {shared.length}
                </span>
                <span className="font-mono" style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>
                  {sortNote}
                </span>
              </div>
              <div className="flex flex-col" style={{ gap: "9px" }}>
                {shared.length === 0 ? (
                  <div
                    className="font-body text-center rounded-xl"
                    style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "18px" }}
                  >
                    No words match this filter.
                  </div>
                ) : (
                  shared.map((row) => {
                    const tierBadge = tierOf(row);
                    const borderColor = row.newSolvers > 0 ? "rgba(255,180,60,0.3)" : "rgba(255,255,255,0.08)";
                    return (
                      <button
                        key={row.puzzleId}
                        onClick={() => openShared(row)}
                        className="font-body w-full text-left rounded-xl"
                        style={{
                          border: `1px solid ${borderColor}`,
                          background: "rgba(255,255,255,0.02)",
                          padding: "14px 15px",
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center min-w-0" style={{ gap: "9px" }}>
                            <span
                              className="font-display"
                              style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.05em", color: "#f5f0e8" }}
                            >
                              {row.word.toUpperCase()}
                            </span>
                            {tierBadge && (
                              <span
                                className="font-mono shrink-0"
                                style={{ fontSize: "10px", color: tierBadge.color, background: tierBadge.bg, borderRadius: "5px", padding: "2px 7px" }}
                              >
                                {tierBadge.icon} {tierBadge.label}
                              </span>
                            )}
                            {row.newSolvers > 0 && (
                              <span
                                className="font-mono shrink-0"
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 600,
                                  color: "#0f0d0b",
                                  background: "rgba(255,180,60,0.95)",
                                  padding: "2px 6px",
                                  borderRadius: "20px",
                                }}
                              >
                                {row.newSolvers} new
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.25)" }}>{"›"}</span>
                        </div>
                        <div className="flex items-center" style={{ gap: "14px", marginTop: "9px" }}>
                          <span className="font-mono" style={{ fontSize: "11px", color: sort === "date" ? "rgba(255,180,60,0.85)" : "rgba(255,255,255,0.4)" }}>
                            {formatDate(row.createdAt.split("T")[0])}
                          </span>
                          <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                            {row.plays} play{row.plays === 1 ? "" : "s"}
                          </span>
                          <span className="font-mono" style={{ fontSize: "11px", color: sort === "avg" ? "rgba(255,180,60,0.85)" : "rgba(255,255,255,0.4)" }}>
                            {row.avgGuesses == null ? "—" : `avg ${row.avgGuesses.toFixed(1)}`}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
