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
