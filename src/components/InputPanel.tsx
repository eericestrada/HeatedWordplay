import { useState, useEffect } from "react";
import type { LetterStates } from "../types";

const QWERTY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);
const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const KEY_COLORS: Record<string, { bg: string; color: string }> = {
  correct: { bg: "#2d8a4e", color: "#fff" },
  present: { bg: "#1a9e9e", color: "#fff" },
  absent: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" },
  unused: { bg: "rgba(255,255,255,0.1)", color: "#f5f0e8" },
};

const POOL_COLORS: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  correct: {
    bg: "#2d8a4e",
    color: "#fff",
    border: "1px solid rgba(45,138,78,0.5)",
  },
  present: {
    bg: "#1a9e9e",
    color: "#fff",
    border: "1px solid rgba(26,158,158,0.5)",
  },
  unused: {
    bg: "rgba(255,255,255,0.1)",
    color: "#f5f0e8",
    border: "1px solid rgba(255,255,255,0.06)",
  },
};

interface InputPanelProps {
  letterStates: LetterStates;
  onKey: (key: string) => void;
  magnetMode: boolean;
  onMagnetSelect: (letter: string) => void;
  magnetsUsed: number;
  canMagnet: boolean;
  magnetEligible?: string[];
  onMagnetRequest: () => void;
  onMagnetCancel: () => void;
  hasClue: boolean;
  clueRevealed: boolean;
  onClueRequest: () => void;
}

function toolbarButton(active: boolean, color: string) {
  return {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "11px",
    fontWeight: 600,
    padding: "5px 10px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer" as const,
    background: active ? `rgba(${color},0.15)` : "transparent",
    color: active ? `rgba(${color},0.9)` : "rgba(255,255,255,0.3)",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
  };
}

export default function InputPanel({
  letterStates,
  onKey,
  magnetMode,
  onMagnetSelect,
  magnetsUsed,
  canMagnet,
  magnetEligible,
  onMagnetRequest,
  onMagnetCancel,
  hasClue,
  clueRevealed,
  onClueRequest,
}: InputPanelProps) {
  const [view, setView] = useState<"qwerty" | "pool">("qwerty");
  const [poolOrder, setPoolOrder] = useState<string[] | null>(null);

  const magnetEligibleSet = new Set(magnetEligible || []);
  const handleLetterClick = (ch: string) => {
    if (magnetMode && magnetEligibleSet.has(ch)) {
      onMagnetSelect(ch);
    } else {
      onKey(ch);
    }
  };

  const viable = ALL_LETTERS.filter((ch) => letterStates[ch] !== "absent");
  const viableVowels = viable.filter((ch) => VOWELS.has(ch));
  const viableConsonants = viable.filter((ch) => !VOWELS.has(ch));
  const consonantOrder = poolOrder || [...viableConsonants].sort();

  const shuffle = () => {
    const arr = [...viableConsonants];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setPoolOrder(arr);
  };

  useEffect(() => {
    setPoolOrder(null);
  }, [Object.keys(letterStates).length]);

  const renderPoolKey = (ch: string, isVowel: boolean) => {
    const state = letterStates[ch] || "unused";
    const c = POOL_COLORS[state] || POOL_COLORS.unused;
    const isMagnetTarget = magnetMode && magnetEligibleSet.has(ch);
    return (
      <button
        key={ch}
        onClick={() => handleLetterClick(ch)}
        className="font-mono flex items-center justify-center rounded-md"
        style={{
          width: isVowel ? "40px" : "38px",
          height: isVowel ? "48px" : "44px",
          fontSize: isVowel ? "16px" : "15px",
          fontWeight: isVowel ? 700 : 600,
          backgroundColor: c.bg,
          color: c.color,
          border: c.border,
          cursor: "pointer",
          transition: "all 0.15s ease",
          animation: isMagnetTarget ? "magnetPulse 1s ease infinite" : "none",
          boxShadow: isMagnetTarget
            ? "0 0 12px rgba(26,158,158,0.4)"
            : "none",
          transform: isMagnetTarget ? "scale(1.1)" : "scale(1)",
        }}
      >
        {ch}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 items-center w-full">
      {/* Unified toolbar */}
      <div
        className="flex items-center justify-center gap-1 w-full rounded-lg"
        style={{
          background: "rgba(255,255,255,0.03)",
          padding: "3px 4px",
        }}
      >
        {/* Clue */}
        {hasClue &&
          (clueRevealed ? (
            <button
              onClick={onClueRequest}
              style={toolbarButton(false, "255,180,60")}
            >
              💡
            </button>
          ) : (
            <button
              onClick={onClueRequest}
              style={toolbarButton(false, "255,180,60")}
            >
              💡 Clue
            </button>
          ))}

        {/* Magnet */}
        {magnetMode ? (
          <button
            onClick={onMagnetCancel}
            style={{
              ...toolbarButton(true, "26,158,158"),
              background: "rgba(26,158,158,0.15)",
              color: "rgba(26,158,158,0.9)",
              animation: "magnetPulse 1.5s ease infinite",
            }}
          >
            🧲 Tap a letter · Cancel
          </button>
        ) : canMagnet ? (
          <button
            onClick={onMagnetRequest}
            style={toolbarButton(false, "26,158,158")}
          >
            🧲 {2 - magnetsUsed}
          </button>
        ) : magnetsUsed > 0 ? (
          <div
            className="font-body"
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.15)",
              padding: "5px 8px",
            }}
          >
            🧲 ✓
          </div>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <div
          className="flex gap-0.5 rounded-md"
          style={{ background: "rgba(255,255,255,0.04)", padding: "2px" }}
        >
          <button
            onClick={() => setView("qwerty")}
            className="font-body rounded-[5px]"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "4px 10px",
              border: "none",
              cursor: "pointer",
              background:
                view === "qwerty"
                  ? "rgba(255,255,255,0.12)"
                  : "transparent",
              color:
                view === "qwerty"
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.25)",
              transition: "all 0.15s ease",
            }}
          >
            QWERTY
          </button>
          <button
            onClick={() => setView("pool")}
            className="font-body rounded-[5px]"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "4px 10px",
              border: "none",
              cursor: "pointer",
              background:
                view === "pool"
                  ? "rgba(255,255,255,0.12)"
                  : "transparent",
              color:
                view === "pool"
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.25)",
              transition: "all 0.15s ease",
            }}
          >
            Pool
          </button>
        </div>

        {/* Shuffle */}
        {view === "pool" && (
          <button
            onClick={shuffle}
            style={toolbarButton(false, "255,255,255")}
          >
            ⟳
          </button>
        )}
      </div>

      {view === "qwerty" ? (
        <div className="flex flex-col gap-[5px] items-center w-full">
          {QWERTY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-[4px] w-full" style={{
              paddingLeft: ri === 1 ? "5%" : ri === 2 ? "0" : "0",
              paddingRight: ri === 1 ? "5%" : ri === 2 ? "0" : "0",
            }}>
              {ri === 2 && (
                <button
                  onClick={() => onKey("Enter")}
                  className="font-mono flex items-center justify-center rounded-md"
                  style={{
                    flex: "1.5",
                    height: "clamp(46px, 11.5vw, 58px)",
                    fontSize: "clamp(11px, 2.8vw, 13px)",
                    fontWeight: 600,
                    backgroundColor: "rgba(45,138,78,0.15)",
                    color: "rgba(45,138,78,0.9)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ENTER
                </button>
              )}
              {row.map((key) => {
                const state = letterStates[key];
                const c = KEY_COLORS[state] || KEY_COLORS.unused;
                const isMagnetTarget = magnetMode && magnetEligibleSet.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => handleLetterClick(key)}
                    className="font-mono flex items-center justify-center rounded-md"
                    style={{
                      flex: "1",
                      minWidth: 0,
                      height: "clamp(46px, 11.5vw, 58px)",
                      fontSize: "clamp(15px, 3.8vw, 18px)",
                      fontWeight: 600,
                      backgroundColor: c.bg,
                      color: c.color,
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      animation: isMagnetTarget
                        ? "magnetPulse 1s ease infinite"
                        : "none",
                      boxShadow: isMagnetTarget
                        ? "0 0 12px rgba(26,158,158,0.4)"
                        : "none",
                    }}
                  >
                    {key}
                  </button>
                );
              })}
              {ri === 2 && (
                <button
                  onClick={() => onKey("Backspace")}
                  className="font-mono flex items-center justify-center rounded-md"
                  style={{
                    flex: "1.5",
                    height: "clamp(46px, 11.5vw, 58px)",
                    fontSize: "clamp(11px, 2.8vw, 13px)",
                    fontWeight: 600,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.5)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-center w-full">
          {/* Consonant grid */}
          {viableConsonants.length > 0 && (
            <div
              className="flex flex-wrap gap-[5px] justify-center"
              style={{ maxWidth: "400px" }}
            >
              {consonantOrder
                .filter((ch) => viable.includes(ch))
                .map((ch) => renderPoolKey(ch, false))}
            </div>
          )}

          {/* Bottom row: Enter + vowels + ⌫ */}
          <div className="flex gap-[5px] items-center justify-center">
            <button
              onClick={() => onKey("Enter")}
              className="font-mono flex items-center justify-center rounded-md"
              style={{
                height: "48px",
                padding: "0 14px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: "rgba(45,138,78,0.15)",
                color: "rgba(45,138,78,0.9)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              ENTER
            </button>

            {viableVowels.map((ch) => renderPoolKey(ch, true))}

            <button
              onClick={() => onKey("Backspace")}
              className="font-mono flex items-center justify-center rounded-md"
              style={{
                height: "48px",
                padding: "0 14px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              ⌫
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
