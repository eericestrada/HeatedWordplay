import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getHeadToHead } from "../lib/api";
import { getMedalEmoji, getDifficultyTier } from "../utils/scoring";
import type { HeadToHead as H2HData, H2HWord } from "../types";

interface HeadToHeadProps {
  partnerId: string;
  partnerName: string;
  streak: number;
}

function outcomeEmoji(w: H2HWord): string {
  if (w.medal) return getMedalEmoji(w.medal);
  return w.surrendered ? "🏳️" : "❌";
}

function outcomeDetail(w: H2HWord): { text: string; color: string } {
  if (w.medal) return { text: `${w.total_guesses}/6`, color: "rgba(255,255,255,0.4)" };
  if (w.surrendered) return { text: "gave up", color: "rgba(255,180,60,0.6)" };
  return { text: "stumped", color: "rgba(255,255,255,0.35)" };
}

// Guess-distribution buckets: 1–6 for solved-in-N, plus ✗ for not solved
// (stumped or gave up). Colors warm from green → red across the columns.
const GUESS_BUCKETS: { short: string; color: string }[] = [
  { short: "1", color: "#2d8a4e" },
  { short: "2", color: "rgba(120,200,80,0.85)" },
  { short: "3", color: "rgba(200,200,70,0.85)" },
  { short: "4", color: "rgba(255,180,60,0.85)" },
  { short: "5", color: "rgba(255,130,60,0.85)" },
  { short: "6", color: "rgba(255,100,60,0.85)" },
  { short: "✗", color: "rgba(255,90,90,0.9)" },
];

// One representative score per difficulty tier, in order, so the tier rows
// derive their icon/color/label from getDifficultyTier (no re-hardcoding).
const TIER_REPS = [10, 15, 18, 22, 30];

interface TierBar { label: string; icon: string; color: string; count: number; pct: number }
interface GuessBar { short: string; color: string; count: number; pct: number }

/**
 * Two distributions over a set of words, both bar-normalized to their own max
 * so the tallest bar fills the row/plot:
 *  - tiers: difficulty spread (only v1-scored words have a tier, matching the
 *    per-row icon convention); hasScored is false when none qualify.
 *  - guesses: how many guesses solves took, with a ✗ column for non-solves.
 */
function computeDistributions(words: H2HWord[]): {
  tiers: TierBar[];
  hasScored: boolean;
  guesses: GuessBar[];
} {
  const scored = words.filter((w) => w.has_breakdown);
  const tierCounts = TIER_REPS.map((rep) => {
    const t = getDifficultyTier(rep);
    const count = scored.filter(
      (w) => getDifficultyTier(w.complexity).label === t.label,
    ).length;
    return { label: t.label, icon: t.icon, color: t.color, count };
  });
  const tierMax = Math.max(1, ...tierCounts.map((b) => b.count));
  const tiers = tierCounts.map((b) => ({ ...b, pct: Math.round((b.count / tierMax) * 100) }));

  const counts = GUESS_BUCKETS.map((_, i) => {
    if (i === GUESS_BUCKETS.length - 1) return words.filter((w) => !w.medal).length;
    const n = i + 1;
    return words.filter(
      (w) => w.medal && Math.min(Math.max(w.total_guesses, 1), 6) === n,
    ).length;
  });
  const gMax = Math.max(1, ...counts);
  const guesses = GUESS_BUCKETS.map((b, i) => ({
    short: b.short,
    color: b.color,
    count: counts[i],
    pct: Math.round((counts[i] / gMax) * 100),
  }));

  return { tiers, hasScored: scored.length > 0, guesses };
}

export default function HeadToHead({ partnerId, partnerName, streak }: HeadToHeadProps) {
  const { profile } = useAuth();
  const [data, setData] = useState<H2HData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"yours" | "theirs">("yours");

  useEffect(() => {
    if (!profile) return;
    let active = true;
    getHeadToHead(profile.id, partnerId).then((d) => {
      if (!active) return;
      setData(d);
      setLoading(false);
    });
    return () => { active = false; };
  }, [profile, partnerId]);

  const initial = partnerName.charAt(0).toUpperCase();
  const yours = data?.yours ?? [];
  const theirs = data?.theirs ?? [];
  const yoursSolved = yours.filter((w) => w.medal).length;
  const theirsSolved = theirs.filter((w) => w.medal).length;
  const activeWords = view === "yours" ? yours : theirs;
  const dist = computeDistributions(activeWords);

  const avatar = (label: string, bg: string, color: string, size = 42) => (
    <span
      className="flex items-center justify-center rounded-full"
      style={{ width: `${size}px`, height: `${size}px`, fontSize: "16px", fontWeight: 700, background: bg, color }}
    >
      {label}
    </span>
  );

  const wordRow = (w: H2HWord, i: number) => {
    const detail = outcomeDetail(w);
    const tier = w.has_breakdown ? getDifficultyTier(w.complexity) : null;
    return (
      <div
        key={`${w.puzzle_id}-${i}`}
        className="flex items-center justify-between rounded-[9px]"
        style={{
          padding: "10px 14px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: "8px" }}>
          <span className="font-display" style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.04em", color: "#f5f0e8" }}>
            {w.word.toUpperCase()}
          </span>
          {tier && (
            <span
              title={`${tier.label} · difficulty ${w.complexity}`}
              aria-label={tier.label}
              style={{ fontSize: "13px", lineHeight: 1, flexShrink: 0 }}
            >
              {tier.icon}
            </span>
          )}
        </div>
        <div className="flex items-center" style={{ gap: "8px" }}>
          <span className="font-body" style={{ fontSize: "11px", color: detail.color }}>{detail.text}</span>
          <span style={{ fontSize: "15px" }}>{outcomeEmoji(w)}</span>
        </div>
      </div>
    );
  };

  const sectionHeader = (label: string, solved: number, total: number) => (
    <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
      <div className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: "10px", color: "rgba(255,180,60,0.55)" }}>
        {label}
      </div>
      <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
        {solved}/{total} solved
      </span>
    </div>
  );

  const emptyNote = (text: string) => (
    <div
      className="font-body text-center rounded-[9px]"
      style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "14px" }}
    >
      {text}
    </div>
  );

  return (
    <div className="max-w-[440px] mx-auto" style={{ padding: "8px 20px 40px", animation: "fadeUp 0.35s ease" }}>
      {/* Header */}
      <div className="flex items-center justify-center" style={{ gap: "14px", marginBottom: "6px" }}>
        {avatar("Y", "rgba(255,180,60,0.15)", "rgba(255,180,60,0.9)")}
        <span className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>vs</span>
        {avatar(initial, "rgba(180,120,255,0.15)", "rgba(180,120,255,0.9)")}
      </div>
      <div className="font-display text-center" style={{ fontSize: "20px", fontWeight: 700, color: "#f5f0e8", marginBottom: "14px" }}>
        You &amp; {partnerName}
      </div>

      {streak > 0 && (
        <div
          className="flex items-center justify-center"
          style={{ gap: "8px", background: "rgba(255,140,40,0.06)", border: "1px solid rgba(255,140,40,0.15)", borderRadius: "12px", padding: "11px", marginBottom: "18px" }}
        >
          <span style={{ fontSize: "18px" }}>🔥</span>
          <span className="font-body" style={{ fontSize: "14px", color: "rgba(255,140,40,0.9)" }}>
            <strong>{streak}-day streak</strong> going
          </span>
        </div>
      )}

      {/* Direction toggle */}
      <div
        className="flex"
        style={{ gap: "4px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px", marginBottom: "16px" }}
      >
        {(["yours", "theirs"] as const).map((key) => {
          const active = view === key;
          const label = key === "yours" ? "Your words" : `${partnerName.split(" ")[0]}'s words`;
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              className="font-body flex-1 rounded-lg"
              style={{
                border: "none",
                padding: "9px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                background: active ? "rgba(255,180,60,0.12)" : "transparent",
                color: active ? "rgba(255,180,60,0.95)" : "rgba(255,255,255,0.5)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Distributions over the active direction — recompute when the toggle flips */}
      {!loading && activeWords.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          {dist.hasScored && (
            <>
              <div
                className="font-mono uppercase"
                style={{ fontSize: "9px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "9px" }}
              >
                How hard were they?
              </div>
              <div className="flex flex-col" style={{ gap: "6px", marginBottom: "20px" }}>
                {dist.tiers.map((d) => (
                  <div key={d.label} className="flex items-center" style={{ gap: "8px" }}>
                    <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", width: "84px" }}>
                      {d.icon} {d.label}
                    </span>
                    <div style={{ flex: 1, height: "13px", borderRadius: "3px", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: "3px", width: `${d.pct}%`, background: d.color, transition: "width 0.3s ease" }} />
                    </div>
                    <span className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", width: "14px", textAlign: "right" }}>
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div
            className="font-mono uppercase"
            style={{ fontSize: "9px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "10px" }}
          >
            Guesses to solve
          </div>
          <div className="flex items-end" style={{ gap: "6px", height: "96px", padding: "0 2px" }}>
            {dist.guesses.map((g) => (
              <div
                key={g.short}
                className="flex flex-col items-center"
                style={{ flex: 1, gap: "4px", height: "100%", justifyContent: "flex-end" }}
              >
                <span className="font-mono" style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{g.count}</span>
                <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: `${g.pct}%`, background: g.color, minHeight: "3px", transition: "height 0.3s ease" }} />
                <span className="font-mono" style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>{g.short}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="font-body text-center" style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", padding: "20px" }}>
          Loading…
        </div>
      ) : view === "yours" ? (
        <>
          {sectionHeader(`Your words to ${partnerName}`, yoursSolved, yours.length)}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            {yours.length > 0 ? yours.map(wordRow) : emptyNote(`You haven't sent ${partnerName} a word they've played yet.`)}
          </div>
        </>
      ) : (
        <>
          {sectionHeader(`${partnerName}'s words to you`, theirsSolved, theirs.length)}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            {theirs.length > 0 ? theirs.map(wordRow) : emptyNote(`${partnerName} hasn't sent you a word you've played yet.`)}
          </div>
        </>
      )}
    </div>
  );
}
