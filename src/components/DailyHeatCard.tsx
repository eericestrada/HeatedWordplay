import { useState } from "react";
import type { DailyHeatState } from "../types";
import { buildEmojiGrid, copyToClipboard } from "../utils/sharing";

interface DailyHeatCardProps {
  state: DailyHeatState;
  onPlay: () => void;
  shareText?: string;
}

export default function DailyHeatCard({ state, onPlay, shareText }: DailyHeatCardProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!shareText) return;
    const ok = await copyToClipboard(shareText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="rounded-xl"
      style={{
        background: "linear-gradient(135deg, rgba(255,140,40,0.08) 0%, rgba(255,80,20,0.04) 100%)",
        border: "1px solid rgba(255,140,40,0.2)",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: "18px" }}>🔥</span>
        <span
          className="font-display"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#f5f0e8",
          }}
        >
          Daily Heat
        </span>
      </div>

      {/* State 1 & 2: Unplayed */}
      {state.status === "unplayed" && (
        <>
          <div
            className="font-body"
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "16px",
              lineHeight: 1.5,
            }}
          >
            Everyone's doing it. Get in there.
          </div>
          {state.streak > 0 && (
            <div
              className="font-mono flex items-center gap-1.5 mb-4"
              style={{
                fontSize: "13px",
                color: "rgba(255,140,40,0.9)",
                fontWeight: 600,
              }}
            >
              🔥 {state.streak} day streak
            </div>
          )}
          <button
            onClick={onPlay}
            className="font-body w-full rounded-lg"
            style={{
              fontSize: "15px",
              fontWeight: 600,
              padding: "12px 24px",
              border: "1px solid rgba(255,140,40,0.35)",
              background: "rgba(255,140,40,0.12)",
              color: "rgba(255,140,40,0.95)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              letterSpacing: "0.04em",
            }}
          >
            Play Now
          </button>
        </>
      )}

      {/* State 3: Completed */}
      {state.status === "completed" && (
        <>
          <div
            className="font-body"
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "4px",
              lineHeight: 1.5,
            }}
          >
            You nailed it in {state.guesses}.
          </div>
          {state.streak > 0 && (
            <div
              className="font-mono flex items-center gap-1.5 mb-4"
              style={{
                fontSize: "13px",
                color: "rgba(255,140,40,0.9)",
                fontWeight: 600,
              }}
            >
              🔥 {state.streak} day streak
            </div>
          )}
          {/* Compact emoji grid */}
          <div
            className="font-mono whitespace-pre-wrap mb-4"
            style={{
              fontSize: "14px",
              lineHeight: 1.4,
            }}
          >
            {buildEmojiGrid(state.rows)}
          </div>
          <button
            onClick={handleShare}
            className="font-body w-full rounded-lg"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "10px 24px",
              border: copied
                ? "1px solid rgba(45,138,78,0.4)"
                : "1px solid rgba(255,140,40,0.25)",
              background: copied
                ? "rgba(45,138,78,0.12)"
                : "rgba(255,255,255,0.04)",
              color: copied
                ? "rgba(45,138,78,0.95)"
                : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {copied ? "Copied!" : "Share"}
          </button>
        </>
      )}

      {/* State 4: Streak broken */}
      {state.status === "streak_broken" && (
        <>
          <div
            className="font-body"
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "4px",
              lineHeight: 1.5,
            }}
          >
            This one got away.
          </div>
          <div
            className="font-body"
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.3)",
              marginBottom: "16px",
            }}
          >
            Start fresh
          </div>
          <button
            onClick={onPlay}
            className="font-body w-full rounded-lg"
            style={{
              fontSize: "15px",
              fontWeight: 600,
              padding: "12px 24px",
              border: "1px solid rgba(255,140,40,0.35)",
              background: "rgba(255,140,40,0.12)",
              color: "rgba(255,140,40,0.95)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              letterSpacing: "0.04em",
            }}
          >
            Play Now
          </button>
        </>
      )}
    </div>
  );
}
