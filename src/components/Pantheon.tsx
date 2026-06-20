import { useEffect, useState } from "react";
import { getPantheon } from "../lib/api";
import { getDifficultyTier, getMedalEmoji, tormentScore } from "../utils/scoring";
import type { PantheonEntry } from "../types";

interface PantheonProps {
  /** Open a word's detail by its puzzle id. */
  onOpenPuzzle: (puzzleId: string) => void;
}

interface ScoredEntry extends PantheonEntry {
  torment: number;
  breakdown: string;
  tierIcon: string | null;
  tierColor: string | null;
}

function scoreEntry(e: PantheonEntry): ScoredEntry {
  const tier = e.has_breakdown ? getDifficultyTier(e.complexity) : null;
  const parts = [`${e.dead_ends} dead end${e.dead_ends === 1 ? "" : "s"}`];
  if (e.failed_count) parts.push(`${e.failed_count} stumped`);
  if (e.surrendered_count) parts.push(`${e.surrendered_count} gave up`);
  let breakdown = parts.join(" · ");
  if (tier) breakdown += ` · ${tier.icon} ${tier.label}`;
  return {
    ...e,
    torment: tormentScore(e),
    breakdown,
    tierIcon: tier?.icon ?? null,
    tierColor: tier?.color ?? null,
  };
}

export default function Pantheon({ onOpenPuzzle }: PantheonProps) {
  const [entries, setEntries] = useState<ScoredEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    getPantheon().then((data) => {
      if (!active) return;
      const scored = data
        .map(scoreEntry)
        .filter((e) => e.torment > 0)
        .sort((a, b) => b.torment - a.torment);
      setEntries(scored);
    });
    return () => {
      active = false;
    };
  }, []);

  // Nothing to celebrate yet (still loading, or no word has drawn any struggle).
  if (!entries || entries.length === 0) return null;

  const [champ, ...rest] = entries;

  return (
    <div style={{ marginBottom: "24px" }}>
      <div className="font-body text-center" style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: "2px 0 4px" }}>
        Why do you hurt people so?
      </div>
      <div className="font-mono text-center" style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)", marginBottom: "18px" }}>
        Torment score is based on dead ends + quitting + failures
      </div>

      {/* Champion */}
      <button
        onClick={() => onOpenPuzzle(champ.puzzle_id)}
        className="w-full text-center"
        style={{
          border: "1px solid rgba(255,140,40,0.3)",
          borderRadius: "16px",
          padding: "20px 18px",
          cursor: "pointer",
          marginBottom: rest.length > 0 ? "12px" : 0,
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,90,90,0.13), transparent 70%), rgba(255,180,60,0.04)",
        }}
      >
        <div
          className="font-mono uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.16em", color: "rgba(255,180,60,0.7)" }}
        >
          👑 Most tormenting
        </div>
        <div
          className="font-display"
          style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.06em", color: "#f5f0e8", margin: "8px 0 4px" }}
        >
          {champ.word.toUpperCase()}
        </div>
        <div className="flex items-baseline justify-center" style={{ gap: "7px", margin: "8px 0 6px" }}>
          <span className="font-mono" style={{ fontSize: "30px", fontWeight: 700, color: "rgba(255,120,60,0.95)" }}>
            {champ.torment}
          </span>
          <span className="font-mono uppercase" style={{ fontSize: "10px", letterSpacing: "0.14em", color: "rgba(255,140,40,0.7)" }}>
            torment
          </span>
        </div>
        <div className="font-body" style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
          {champ.breakdown}
        </div>
      </button>

      {/* The rest */}
      {rest.length > 0 && (
        <div className="flex flex-col" style={{ gap: "8px" }}>
          {rest.map((p, i) => (
            <button
              key={p.puzzle_id}
              onClick={() => onOpenPuzzle(p.puzzle_id)}
              className="flex items-center w-full text-left rounded-[10px]"
              style={{
                gap: "12px",
                padding: "11px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                cursor: "pointer",
              }}
            >
              <span
                className="font-display shrink-0"
                style={{ fontSize: "15px", fontWeight: 700, color: "rgba(255,255,255,0.35)", width: "16px" }}
              >
                {i + 2}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center" style={{ gap: "7px" }}>
                  <span className="font-display" style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.04em", color: "#f5f0e8" }}>
                    {p.word.toUpperCase()}
                  </span>
                  {p.tierIcon && (
                    <span style={{ fontSize: "11px", lineHeight: 1, color: p.tierColor ?? undefined }}>{p.tierIcon}</span>
                  )}
                  {p.failed_count > 0 && (
                    <span title={`${p.failed_count} stumped`} style={{ fontSize: "11px", lineHeight: 1 }}>
                      {getMedalEmoji("failed")}
                    </span>
                  )}
                  {p.surrendered_count > 0 && (
                    <span title={`${p.surrendered_count} gave up`} style={{ fontSize: "11px", lineHeight: 1 }}>
                      {getMedalEmoji("surrendered")}
                    </span>
                  )}
                </div>
                <div className="font-body" style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                  {p.breakdown}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono" style={{ fontSize: "16px", fontWeight: 700, color: "rgba(255,120,60,0.9)" }}>
                  {p.torment}
                </div>
                <div className="font-mono uppercase" style={{ fontSize: "8px", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)" }}>
                  torment
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
