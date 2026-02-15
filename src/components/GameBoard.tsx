import { useState, useEffect, useCallback } from "react";
import Tile, { TileRow } from "./Tile";
import InputPanel from "./InputPanel";
import { evaluateCells } from "../utils/evaluation";
import { getMedal } from "../utils/scoring";
import type {
  Puzzle,
  GridCell,
  CompletedRow,
  LetterStates,
  Medal,
} from "../types";

const MAX_GUESSES = 6;

function emptyGrid(length: number): GridCell[] {
  return Array.from({ length }, () => ({ letter: "", pinned: false }));
}

interface GameBoardProps {
  puzzle: Puzzle;
  onComplete: (
    totalGuesses: number,
    medal: Medal | null,
    usedClue: boolean,
    magnetsUsed: number,
    rows: CompletedRow[],
  ) => void;
  onBack: () => void;
}

export default function GameBoard({
  puzzle,
  onComplete,
  onBack,
}: GameBoardProps) {
  const wordLength = puzzle.word.length;

  const [completedRows, setCompletedRows] = useState<CompletedRow[]>([]);
  const [grid, setGrid] = useState<GridCell[]>(() => emptyGrid(wordLength));
  const [letterStates, setLetterStates] = useState<LetterStates>({});
  const [gameOver, setGameOver] = useState(false);
  const [shake, setShake] = useState(false);
  const [revealingRow, setRevealingRow] = useState(-1);
  const [revealedCount, setRevealedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [clueRevealed, setClueRevealed] = useState(false);
  const [showClueConfirm, setShowClueConfirm] = useState(false);
  const [showClueDialog, setShowClueDialog] = useState(false);
  const [magnetsUsed, setMagnetsUsed] = useState(0);
  const [magnetMode, setMagnetMode] = useState(false);
  const [showMagnetConfirm, setShowMagnetConfirm] = useState(false);

  const totalCount = completedRows.length;
  const filledCount = grid.filter((c) => c.letter).length;
  const hasPins = grid.some((c) => c.pinned);
  const isShort = filledCount > 0 && filledCount < wordLength;
  const presentLetters = Object.entries(letterStates)
    .filter(([, s]) => s === "present")
    .map(([ch]) => ch);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 1500);
  };

  const typeLetter = (letter: string) => {
    setGrid((prev) => {
      const next = prev.map((c) => ({ ...c }));
      for (let i = 0; i < wordLength; i++) {
        if (!next[i].letter && !next[i].pinned) {
          next[i].letter = letter;
          return next;
        }
      }
      return prev;
    });
  };

  const removeLetter = () => {
    setGrid((prev) => {
      const next = prev.map((c) => ({ ...c }));
      for (let i = wordLength - 1; i >= 0; i--) {
        if (next[i].letter && !next[i].pinned) {
          next[i].letter = "";
          return next;
        }
      }
      return prev;
    });
  };

  const togglePin = (idx: number) => {
    if (gameOver || revealingRow !== -1) return;
    setGrid((prev) => {
      const next = prev.map((c) => ({ ...c }));
      if (next[idx].letter) {
        next[idx].pinned = !next[idx].pinned;
      }
      return next;
    });
  };

  const useMagnet = (ch: string) => {
    const answerLetters = puzzle.word.split("");
    const correctPositions: number[] = [];
    for (let i = 0; i < wordLength; i++) {
      if (answerLetters[i] === ch) correctPositions.push(i);
    }
    let targetPos: number | null = null;
    for (const pos of correctPositions) {
      const cell = grid[pos];
      if (!(cell.letter === ch && cell.pinned)) {
        targetPos = pos;
        break;
      }
    }
    if (targetPos === null) {
      showMsg("Already placed!");
      setMagnetMode(false);
      return;
    }

    const tp = targetPos;
    setGrid((prev) => {
      const next = prev.map((c) => ({ ...c }));
      if (next[tp].letter && !next[tp].pinned) {
        next[tp] = { letter: "", pinned: false };
      }
      next[tp] = { letter: ch, pinned: true };
      return next;
    });
    setMagnetsUsed((prev) => prev + 1);
    setMagnetMode(false);
    showMsg(
      magnetsUsed === 0
        ? "🧲 Magnet used — 25% penalty"
        : "🧲 Magnet used — 50% penalty",
    );
  };

  const handleKey = useCallback(
    (key: string) => {
      if (gameOver || revealingRow !== -1) return;
      if (magnetMode) return;

      if (key === "⌫" || key === "Backspace") {
        removeLetter();
        return;
      }

      if (key === "ENTER" || key === "Enter") {
        const filledCells = grid.filter((c) => c.letter);
        if (filledCells.length < 2) {
          setShake(true);
          showMsg("Enter at least 2 letters");
          setTimeout(() => setShake(false), 400);
          return;
        }

        const isFull = filledCells.length === wordLength;
        const guessWord = grid.map((c) => c.letter).join("");

        const rowResult = evaluateCells(grid, puzzle.word);
        const solved = isFull && guessWord === puzzle.word;
        const newRows = [...completedRows, { result: rowResult }];
        const newTotal = totalCount + 1;

        setCompletedRows(newRows);
        setGrid(emptyGrid(wordLength));

        // Sequential reveal with synced keyboard updates
        setRevealingRow(completedRows.length);
        setRevealedCount(0);
        for (let t = 0; t < wordLength; t++) {
          setTimeout(() => {
            setRevealedCount(t + 1);
            const cell = rowResult[t];
            if (cell.letter) {
              setLetterStates((prev) => {
                const ns = { ...prev };
                if (cell.status === "correct") ns[cell.letter] = "correct";
                else if (
                  cell.status === "present" &&
                  ns[cell.letter] !== "correct"
                )
                  ns[cell.letter] = "present";
                else if (
                  cell.status === "absent" &&
                  ns[cell.letter] !== "correct" &&
                  ns[cell.letter] !== "present"
                )
                  ns[cell.letter] = "absent";
                return ns;
              });
            }
          }, (t + 1) * 350);
        }

        const revealDuration = wordLength * 350 + 200;
        if (solved || newTotal >= MAX_GUESSES) {
          setTimeout(() => {
            setGameOver(true);
            onComplete(
              newTotal,
              getMedal(newTotal, solved),
              clueRevealed,
              magnetsUsed,
              newRows,
            );
          }, revealDuration + 400);
        }
        setTimeout(() => setRevealingRow(-1), revealDuration);
        return;
      }

      // Arrow keys for shift
      if (
        (key === "ArrowLeft" || key === "ArrowRight") &&
        !hasPins &&
        filledCount > 0 &&
        filledCount < wordLength
      ) {
        setGrid((prev) => {
          const next = prev.map((c) => ({ ...c }));
          const letters = next.filter((c) => c.letter).map((c) => c.letter);
          const start = next.findIndex((c) => c.letter);
          const newStart =
            key === "ArrowLeft"
              ? Math.max(0, start - 1)
              : Math.min(wordLength - letters.length, start + 1);
          const shifted = emptyGrid(wordLength);
          letters.forEach((l, i) => {
            shifted[newStart + i].letter = l;
          });
          return shifted;
        });
        return;
      }

      const letter = key.toUpperCase();
      if (/^[A-Z]$/.test(letter) && filledCount < wordLength) {
        typeLetter(letter);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      grid,
      completedRows,
      gameOver,
      revealingRow,
      wordLength,
      totalCount,
      puzzle.word,
      onComplete,
      clueRevealed,
      magnetMode,
      hasPins,
      filledCount,
      magnetsUsed,
    ],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) handleKey(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  // Build display rows
  const displayRows: React.ReactNode[] = [];

  // Completed rows
  completedRows.forEach((row, i) => {
    const isRevealing = revealingRow === i;
    displayRows.push(
      <div key={`done-${i}`}>
        <div className="flex gap-1.5 justify-center">
          {row.result.map((cell, ci) => {
            const revealed = !isRevealing || ci < revealedCount;
            return (
              <Tile
                key={ci}
                letter={cell.letter}
                status={revealed ? cell.status : null}
                isActive={false}
                isRevealing={isRevealing && ci === revealedCount - 1}
              />
            );
          })}
        </div>
      </div>,
    );
  });

  // Active row
  if (!gameOver && revealingRow === -1) {
    const hasContent = grid.some((c) => c.letter);
    displayRows.push(
      <div
        key="active"
        style={{ animation: shake ? "shake 0.4s ease" : "none" }}
      >
        <div className="flex gap-1.5 justify-center">
          {grid.map((cell, i) => (
            <Tile
              key={i}
              letter={cell.letter}
              status={null}
              isActive={hasContent ? !!cell.letter : i === 0}
              isRevealing={false}
              pinned={cell.pinned}
              onClick={cell.letter ? () => togglePin(i) : undefined}
            />
          ))}
        </div>
        {/* Shift arrows */}
        {!hasPins && isShort && (
          <div className="flex justify-center gap-5 mt-1.5">
            <button
              onClick={() => handleKey("ArrowLeft")}
              className="font-mono"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,180,60,0.6)",
                fontSize: "13px",
                padding: "2px 8px",
              }}
            >
              ◀
            </button>
            <button
              onClick={() => handleKey("ArrowRight")}
              className="font-mono"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,180,60,0.6)",
                fontSize: "13px",
                padding: "2px 8px",
              }}
            >
              ▶
            </button>
          </div>
        )}
      </div>,
    );

    // Empty future rows
    for (let i = 0; i < MAX_GUESSES - totalCount - 1; i++) {
      displayRows.push(
        <div key={`empty-${i}`}>
          <TileRow
            result={null}
            wordLength={wordLength}
            isActive={false}
            currentInput=""
            isRevealing={false}
          />
        </div>,
      );
    }
  }

  return (
    <div className="flex flex-col h-full max-w-[520px] mx-auto px-5">
      {/* Spacer pushes content to bottom */}
      <div className="flex-1 min-h-2" />

      {/* Header */}
      <div className="flex items-center justify-between w-full py-2">
        <button
          onClick={onBack}
          className="font-body"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            fontSize: "14px",
            cursor: "pointer",
            padding: "4px 0",
          }}
        >
          ← Back
        </button>
        <div
          className="font-body"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}
        >
          {puzzle.creator === "You" ? "Your" : `${puzzle.creator}'s`} puzzle
        </div>
        <div
          className="font-mono"
          style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}
        >
          {totalCount}/{MAX_GUESSES}
        </div>
      </div>

      {/* Message */}
      <div className="h-[26px] flex items-center justify-center">
        {message && (
          <div
            className="font-body"
            style={{
              fontSize: "13px",
              color: "#f5f0e8",
              background: "rgba(255,255,255,0.12)",
              padding: "5px 16px",
              borderRadius: "6px",
              animation: "fadeUp 0.2s ease",
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex flex-col gap-1.5 items-center py-1">
        {displayRows}
      </div>

      {/* Clue dialog (dismissable) */}
      {showClueDialog && (
        <div
          className="flex items-center gap-2.5 w-full my-1"
          style={{
            padding: "10px 16px",
            background: "rgba(255,180,60,0.06)",
            borderRadius: "8px",
            border: "1px solid rgba(255,180,60,0.15)",
          }}
        >
          <div
            className="flex-1 font-body italic"
            style={{
              fontSize: "14px",
              color: "rgba(255,180,60,0.7)",
            }}
          >
            💡 {puzzle.clue}
          </div>
          <button
            onClick={() => setShowClueDialog(false)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: "16px",
              cursor: "pointer",
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Clue confirm dialog */}
      {!gameOver && showClueConfirm && (
        <div
          className="flex flex-col items-center gap-2 w-full my-1"
          style={{
            padding: "12px 16px",
            background: "rgba(255,180,60,0.06)",
            borderRadius: "8px",
            border: "1px solid rgba(255,180,60,0.15)",
          }}
        >
          <div
            className="font-body text-center"
            style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
          >
            Reveal clue?{" "}
            <strong style={{ color: "rgba(255,180,60,0.9)" }}>
              You'll lose 50% of your points
            </strong>{" "}
            for this word.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setClueRevealed(true);
                setShowClueConfirm(false);
                setShowClueDialog(true);
                showMsg("Clue revealed — 50% penalty applied");
              }}
              className="font-body"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid rgba(255,180,60,0.3)",
                background: "rgba(255,180,60,0.12)",
                color: "rgba(255,180,60,0.9)",
                cursor: "pointer",
              }}
            >
              Reveal
            </button>
            <button
              onClick={() => setShowClueConfirm(false)}
              className="font-body"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
              }}
            >
              No thanks
            </button>
          </div>
        </div>
      )}

      {/* Magnet confirm dialog */}
      {!gameOver && showMagnetConfirm && (
        <div
          className="flex flex-col items-center gap-2 w-full my-1"
          style={{
            padding: "12px 16px",
            background: "rgba(26,158,158,0.06)",
            borderRadius: "8px",
            border: "1px solid rgba(26,158,158,0.15)",
          }}
        >
          <div
            className="font-body text-center"
            style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
          >
            Use magnet?{" "}
            <strong style={{ color: "rgba(26,158,158,0.9)" }}>
              You'll lose {magnetsUsed === 0 ? "25%" : "50%"} of your points
            </strong>{" "}
            for this word.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowMagnetConfirm(false);
                setMagnetMode(true);
              }}
              className="font-body"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid rgba(26,158,158,0.3)",
                background: "rgba(26,158,158,0.12)",
                color: "rgba(26,158,158,0.9)",
                cursor: "pointer",
              }}
            >
              Use magnet
            </button>
            <button
              onClick={() => setShowMagnetConfirm(false)}
              className="font-body"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
              }}
            >
              No thanks
            </button>
          </div>
        </div>
      )}

      {/* Input Panel */}
      <div className="w-full flex justify-center py-2">
        <InputPanel
          letterStates={letterStates}
          onKey={handleKey}
          magnetMode={magnetMode}
          onMagnetSelect={useMagnet}
          magnetsUsed={magnetsUsed}
          canMagnet={
            !gameOver &&
            magnetsUsed < 2 &&
            presentLetters.length > 0 &&
            !showMagnetConfirm
          }
          onMagnetRequest={() => setShowMagnetConfirm(true)}
          onMagnetCancel={() => setMagnetMode(false)}
          hasClue={!!puzzle.clue}
          clueRevealed={clueRevealed}
          onClueRequest={() =>
            clueRevealed
              ? setShowClueDialog((p) => !p)
              : setShowClueConfirm(true)
          }
        />
      </div>

      {/* Pin hint */}
      {!gameOver && filledCount > 0 && !hasPins && totalCount > 0 && (
        <div
          className="font-body text-center"
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.15)",
            paddingBottom: "12px",
          }}
        >
          Tap a letter to pin it in place
        </div>
      )}

      {/* Bottom padding */}
      <div className="h-3 shrink-0" />
    </div>
  );
}
