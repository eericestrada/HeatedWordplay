import type { DifficultyBreakdown } from "../types";
import { getDifficultyTier, difficultyFactors } from "../utils/scoring";

interface Props {
  breakdown: DifficultyBreakdown;
  score: number;
}

// Shows the difficulty tier + the additive factors that produced the score.
export default function DifficultyBreakdownPanel({ breakdown, score }: Props) {
  const tier = getDifficultyTier(score);
  const factors = difficultyFactors(breakdown);

  return (
    <div
      className="w-full rounded-xl"
      style={{
        background: "rgba(255,255,255,0.02)",
        padding: "14px 18px",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
        <div
          className="font-body uppercase tracking-[0.12em]"
          style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.35)" }}
        >
          Difficulty
        </div>
        <div
          className="font-mono rounded-md"
          style={{ fontSize: "12px", color: tier.color, background: tier.bg, padding: "3px 10px" }}
        >
          {tier.icon} {tier.label} · {score}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {factors.map((f, i) => (
          <span key={i} className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>{f.label}</span>{" "}
            {i === 0 ? f.value : `+${f.value}`}
          </span>
        ))}
      </div>
    </div>
  );
}
