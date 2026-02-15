import { useState } from "react";
import GameBoard from "./components/GameBoard";
import VictoryScreen from "./components/VictoryScreen";
import PuzzleSelector from "./components/PuzzleSelector";
import SubmitWord from "./components/SubmitWord";
import { PUZZLES } from "./data/mockData";
import type {
  Puzzle,
  Screen,
  CompletionStatus,
  Medal,
  CompletedRow,
  SubmitWordData,
} from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("select");
  const [selectedPuzzle, setSelectedPuzzle] = useState<Puzzle | null>(null);
  const [resultData, setResultData] = useState<{
    totalGuesses: number;
    medal: Medal | null;
    usedClue: boolean;
    magnetsUsed: number;
    rows: CompletedRow[];
  } | null>(null);
  const [completedPuzzles, setCompletedPuzzles] = useState<
    Record<number, CompletionStatus>
  >({});
  const [userPuzzles, setUserPuzzles] = useState<Puzzle[]>([]);

  const allPuzzles = [...PUZZLES, ...userPuzzles];

  const handleSelect = (p: Puzzle) => {
    setSelectedPuzzle(p);
    setResultData(null);
    setScreen("play");
  };

  const handleComplete = (
    totalGuesses: number,
    medal: Medal | null,
    usedClue: boolean,
    magnetsUsed: number,
    rows: CompletedRow[],
  ) => {
    setResultData({ totalGuesses, medal, usedClue, magnetsUsed, rows });
    if (selectedPuzzle) {
      setCompletedPuzzles((prev) => ({
        ...prev,
        [selectedPuzzle.id]: medal || "failed",
      }));
    }
    setScreen("result");
  };

  const handleBack = () => {
    setScreen("select");
    setSelectedPuzzle(null);
    setResultData(null);
  };

  const handleSubmitWord = (data: SubmitWordData) => {
    const newPuzzle: Puzzle = {
      id: Date.now(),
      word: data.word,
      creator: "You",
      definition: data.definition,
      clue: data.clue,
      context: data.inspo,
      complexity: data.complexity,
      submittedAt: data.submittedAt,
    };
    setUserPuzzles((prev) => [...prev, newPuzzle]);
    setCompletedPuzzles((prev) => ({
      ...prev,
      [newPuzzle.id]: "submitted",
    }));
    setScreen("submitted");
    setSelectedPuzzle(newPuzzle);
  };

  return (
    <div
      className="h-screen flex flex-col relative overflow-hidden"
      style={{
        background:
          "linear-gradient(165deg, #1a1410 0%, #0f0d0b 40%, #121016 100%)",
        color: "#f5f0e8",
      }}
    >
      {/* Ambient glow overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(255,140,40,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(180,120,255,0.02) 0%, transparent 60%)",
        }}
      />

      {/* Title bar (hidden during gameplay) */}
      {screen !== "play" && (
        <div
          className="text-center relative z-[1] shrink-0"
          style={{ padding: "28px 20px 8px" }}
        >
          <h1
            onClick={() => screen !== "select" && handleBack()}
            className="font-display"
            style={{
              fontSize: "clamp(22px, 6vw, 30px)",
              fontWeight: 800,
              margin: 0,
              background: "linear-gradient(135deg, #f5f0e8, #ffb43c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.01em",
              cursor: screen !== "select" ? "pointer" : "default",
            }}
          >
            Heated Wordplay
          </h1>
          <div
            className="font-mono uppercase tracking-[0.15em]"
            style={{
              fontSize: "11px",
              color: "rgba(255,180,60,0.35)",
              marginTop: "4px",
            }}
          >
            Community Word Puzzles
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className="relative z-[1] flex-1"
        style={{ overflow: screen === "play" ? "hidden" : "auto" }}
      >
        {screen === "select" && (
          <PuzzleSelector
            puzzles={allPuzzles}
            completedPuzzles={completedPuzzles}
            onSelect={handleSelect}
            onSubmitWord={() => setScreen("submit")}
          />
        )}
        {screen === "play" && selectedPuzzle && (
          <GameBoard
            puzzle={selectedPuzzle}
            onComplete={handleComplete}
            onBack={handleBack}
          />
        )}
        {screen === "result" && selectedPuzzle && resultData && (
          <VictoryScreen
            puzzle={selectedPuzzle}
            totalGuesses={resultData.totalGuesses}
            medal={resultData.medal}
            usedClue={resultData.usedClue}
            magnetsUsed={resultData.magnetsUsed}
            rows={resultData.rows}
            onBack={handleBack}
          />
        )}
        {screen === "submit" && (
          <SubmitWord onSubmit={handleSubmitWord} onBack={handleBack} />
        )}
        {screen === "submitted" && selectedPuzzle && (
          <div
            className="flex flex-col items-center gap-6 max-w-[480px] mx-auto"
            style={{
              padding: "32px 20px",
              animation: "fadeUp 0.5s ease",
            }}
          >
            <div style={{ fontSize: "48px", lineHeight: 1 }}>✨</div>
            <div
              className="font-display text-center"
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#f5f0e8",
              }}
            >
              Puzzle submitted!
            </div>
            <div
              className="font-body text-center"
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.4)",
                lineHeight: 1.5,
              }}
            >
              Your friends can now try to guess{" "}
              <strong style={{ color: "rgba(255,180,60,0.8)" }}>
                {selectedPuzzle.word}
              </strong>
              . The definition and inspo stay hidden until they solve it.
            </div>

            {/* Word tiles */}
            <div className="flex gap-1.5 justify-center">
              {selectedPuzzle.word.split("").map((ch, i) => (
                <div
                  key={i}
                  className="font-mono font-bold flex items-center justify-center rounded-lg"
                  style={{
                    width: "clamp(36px, 10vw, 52px)",
                    height: "clamp(36px, 10vw, 52px)",
                    fontSize: "clamp(18px, 5vw, 24px)",
                    border: "2px solid rgba(45,138,78,0.4)",
                    backgroundColor: "rgba(45,138,78,0.08)",
                    color: "#f5f0e8",
                  }}
                >
                  {ch}
                </div>
              ))}
            </div>

            <button
              onClick={handleBack}
              className="font-body rounded-lg"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                padding: "12px 32px",
                border: "1px solid rgba(255,180,60,0.3)",
                background: "rgba(255,180,60,0.08)",
                color: "rgba(255,180,60,0.9)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                letterSpacing: "0.04em",
              }}
            >
              Back to puzzles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
