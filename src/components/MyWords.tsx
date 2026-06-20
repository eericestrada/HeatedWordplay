import { formatDate } from "../utils/scoring";
import { markSeen } from "../utils/myWords";
import type { Puzzle } from "../types";
import type { MyWordRow, MyWordsSummary } from "../utils/myWords";

interface MyWordsProps {
  rows: MyWordRow[];
  summary: MyWordsSummary;
  puzzles: Puzzle[];
  loading: boolean;
  onOpenPuzzle: (puzzle: Puzzle) => void;
  onShareDraft: (puzzle: Puzzle) => void;
  onCreateNew: () => void;
}

export default function MyWords({
  rows,
  summary,
  puzzles,
  loading,
  onOpenPuzzle,
  onShareDraft,
  onCreateNew,
}: MyWordsProps) {
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
      complexity: 0,
      submittedAt: row.createdAt.split("T")[0],
      wordLength: row.word.length,
      isPublic: row.isPublic,
    };
  };

  const drafts = rows.filter((r) => r.isDraft);
  const active = rows.filter((r) => !r.isDraft);

  const openShared = (row: MyWordRow) => {
    markSeen(row.puzzleId, row.solves);
    onOpenPuzzle(resolvePuzzle(row));
  };

  const summaryCard = (value: number, label: string, highlight = false) => (
    <div
      className="text-center rounded-[10px]"
      style={{
        background: highlight ? "rgba(255,180,60,0.08)" : "rgba(255,255,255,0.03)",
        border: highlight ? "1px solid rgba(255,180,60,0.15)" : "1px solid rgba(255,255,255,0.05)",
        padding: "12px 8px",
      }}
    >
      <div
        className="font-mono"
        style={{ fontSize: "20px", fontWeight: 700, color: highlight ? "rgba(255,180,60,0.95)" : "#f5f0e8" }}
      >
        {value}
      </div>
      <div
        className="font-body"
        style={{ fontSize: "10px", color: highlight ? "rgba(255,180,60,0.6)" : "rgba(255,255,255,0.3)", marginTop: "2px" }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div className="max-w-[480px] mx-auto" style={{ padding: "8px 20px 40px", animation: "fadeUp 0.35s ease" }}>
      <div className="font-display" style={{ fontSize: "26px", fontWeight: 700, color: "#f5f0e8", marginBottom: "4px" }}>
        Your words
      </div>
      <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
        Tap a word to share it or see who's been guessing.
      </div>

      {/* Summary strip */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "20px" }}>
        {summaryCard(summary.words, "words")}
        {summaryCard(summary.plays, "plays")}
        {summaryCard(summary.newSolvers, "new solvers", true)}
      </div>

      <button
        onClick={onCreateNew}
        className="font-body w-full rounded-[10px]"
        style={{
          border: "1px dashed rgba(255,180,60,0.25)",
          background: "rgba(255,180,60,0.04)",
          padding: "13px",
          fontSize: "15px",
          fontWeight: 600,
          color: "rgba(255,180,60,0.7)",
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        + Create a new word
      </button>

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
          You haven't created any words yet. Make one and share it — then watch
          who tries to crack it.
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
          <div className="flex flex-col" style={{ gap: "10px", marginBottom: "24px" }}>
            {drafts.map((row) => {
              const puzzle = resolvePuzzle(row);
              return (
                <div
                  key={row.puzzleId}
                  className="flex items-center"
                  style={{
                    gap: "12px",
                    border: "1px dashed rgba(255,180,60,0.3)",
                    background: "rgba(255,180,60,0.04)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <button
                    onClick={() => onShareDraft(puzzle)}
                    className="font-body flex-1 min-w-0 text-left"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <span
                      className="font-display"
                      style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.05em", color: "#f5f0e8" }}
                    >
                      {row.word.toUpperCase()}
                    </span>
                    <div className="font-body" style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "3px" }}>
                      Draft · created {formatDate(row.createdAt.split("T")[0])}
                    </div>
                  </button>
                  <button
                    onClick={() => onShareDraft(puzzle)}
                    className="font-body shrink-0 rounded-lg"
                    style={{
                      padding: "9px 16px",
                      fontSize: "13px",
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

      {/* Shared / live words */}
      {active.length > 0 && (
        <>
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginBottom: "10px" }}
          >
            Shared
          </div>
          <div className="flex flex-col" style={{ gap: "10px" }}>
            {active.map((row) => {
              const rate = row.plays > 0 ? Math.round((row.solves / row.plays) * 100) : null;
              const rateColor =
                rate === null
                  ? "rgba(255,255,255,0.3)"
                  : rate >= 60
                    ? "rgba(45,138,78,0.9)"
                    : rate >= 30
                      ? "rgba(255,180,60,0.85)"
                      : "rgba(255,120,120,0.85)";
              const shareLabel = row.isPublic ? "🌐 Public" : "Shared";
              const shareColor = row.isPublic ? "rgba(26,158,158,0.8)" : "rgba(255,180,60,0.6)";
              const borderColor = row.newSolvers > 0 ? "rgba(255,180,60,0.25)" : "rgba(255,255,255,0.08)";

              return (
                <button
                  key={row.puzzleId}
                  onClick={() => openShared(row)}
                  className="font-body w-full text-left rounded-xl"
                  style={{
                    border: `1px solid ${borderColor}`,
                    background: "rgba(255,255,255,0.02)",
                    padding: "15px 16px",
                    cursor: "pointer",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0" style={{ gap: "10px" }}>
                      <span
                        className="font-display"
                        style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.05em", color: "#f5f0e8" }}
                      >
                        {row.word.toUpperCase()}
                      </span>
                      {row.newSolvers > 0 && (
                        <span
                          className="font-mono"
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
                    <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                      {row.plays} play{row.plays === 1 ? "" : "s"}
                    </span>
                    <span className="font-mono" style={{ fontSize: "11px", color: rateColor }}>
                      {rate === null ? "no plays yet" : `${rate}% solved`}
                    </span>
                    <span className="font-body" style={{ fontSize: "11px", color: shareColor }}>
                      {shareLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
