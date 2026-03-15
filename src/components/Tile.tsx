import type { CellStatus } from "../types";

interface TileProps {
  letter: string;
  status: CellStatus | null;
  isActive: boolean;
  isRevealing: boolean;
  pinned?: boolean;
  hintLetter?: string;
  size?: number;
  onClick?: () => void;
}

const STATUS_STYLES: Record<
  string,
  { bg: string; border: string; color: string }
> = {
  empty: {
    bg: "transparent",
    border: "rgba(255,255,255,0.08)",
    color: "#f5f0e8",
  },
  active: {
    bg: "transparent",
    border: "rgba(255,180,60,0.5)",
    color: "#f5f0e8",
  },
  filled: {
    bg: "transparent",
    border: "rgba(255,255,255,0.25)",
    color: "#f5f0e8",
  },
  correct: { bg: "#2d8a4e", border: "#2d8a4e", color: "#fff" },
  present: { bg: "#1a9e9e", border: "#1a9e9e", color: "#fff" },
  absent: {
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.35)",
  },
};

function resolveState(
  letter: string,
  status: CellStatus | null,
  isActive: boolean,
): string {
  if (status) return status;
  if (letter && isActive) return "active";
  if (letter) return "filled";
  return "empty";
}

export default function Tile({
  letter,
  status,
  isActive,
  isRevealing,
  pinned = false,
  hintLetter,
  size,
  onClick,
}: TileProps) {
  const state = resolveState(letter, status, isActive);
  const c = STATUS_STYLES[state];
  const showHint = hintLetter && !letter && !status;
  const borderColor = pinned
    ? "rgba(255,180,60,0.9)"
    : showHint
      ? "rgba(26,158,158,0.35)"
      : c.border;
  const boxShadow = pinned
    ? "0 0 0 1px rgba(255,180,60,0.3), inset 0 0 8px rgba(255,180,60,0.08)"
    : "none";

  let transform = "scale(1)";
  if (isRevealing) transform = "rotateX(360deg)";
  else if (letter && !status) transform = "scale(1.06)";

  const tileSize = size ? `${size}px` : "clamp(36px, 10vw, 56px)";
  const tileFontSize = size ? `${Math.round(size * 0.48)}px` : "clamp(18px, 5vw, 26px)";

  return (
    <div
      onClick={onClick}
      className="font-mono font-bold uppercase tracking-[0.02em]"
      style={{
        width: tileSize,
        height: tileSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: tileFontSize,
        borderRadius: "8px",
        border: "2px solid",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        backgroundColor: c.bg,
        borderColor,
        color: showHint ? "rgba(26,158,158,0.3)" : c.color,
        boxShadow,
        position: "relative",
        transform,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {letter || (showHint ? hintLetter : "")}
      {pinned && (
        <div
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: "-4px",
            right: "-4px",
            width: "12px",
            height: "12px",
            background: "rgba(255,180,60,0.9)",
            fontSize: "7px",
            lineHeight: 1,
          }}
        >
          📌
        </div>
      )}
      {showHint && (
        <div
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: "-4px",
            right: "-4px",
            width: "12px",
            height: "12px",
            background: "rgba(26,158,158,0.5)",
            fontSize: "7px",
            lineHeight: 1,
          }}
        >
          🧲
        </div>
      )}
    </div>
  );
}

interface TileRowProps {
  result: Array<{ letter: string; status: CellStatus | null }> | null;
  wordLength: number;
  isActive: boolean;
  currentInput: string;
  isRevealing: boolean;
  size?: number;
  gap?: number;
}

export function TileRow({
  result,
  wordLength,
  isActive,
  currentInput,
  isRevealing,
  size,
  gap,
}: TileRowProps) {
  const tiles = [];
  for (let i = 0; i < wordLength; i++) {
    let letter = "";
    let status: CellStatus | null = null;
    if (result) {
      letter = result[i]?.letter || "";
      status = result[i]?.status || null;
    } else if (isActive) {
      letter = currentInput[i] || "";
    }
    tiles.push(
      <Tile
        key={i}
        letter={letter}
        status={status}
        isActive={isActive}
        isRevealing={isRevealing}
        size={size}
      />,
    );
  }
  return (
    <div className="flex justify-center" style={{ gap: `${gap ?? 6}px` }}>{tiles}</div>
  );
}
