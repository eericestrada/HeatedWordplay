import { useState, useEffect, useCallback, useRef } from "react";
import Tile, { TileRow } from "./Tile";
import InputPanel from "./InputPanel";
import { evaluateCells } from "../utils/evaluation";
import { evaluateGuess, useMagnetServer, lookupWord, logSubmission, surrenderGame } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { getMedal } from "../utils/scoring";
import type {
  Puzzle,
  GridCell,
  CompletedRow,
  ResultCell,
  LetterStates,
  Medal,
  GameMode,
} from "../types";

const MAX_GUESSES = 6;

function emptyGrid(length: number): GridCell[] {
  return Array.from({ length }, () => ({ letter: "", pinned: false }));
}

// Persist in-progress game state to localStorage
const SAVE_KEY_PREFIX = "hw-game-";

interface SavedGameState {
  completedRows: CompletedRow[];
  letterStates: LetterStates;
  clueRevealed: boolean;
  magnetsUsed: number;
  magnetTurns?: number[];
  hintedCells?: Record<number, string>;
  savedAt: number;
}

function getSavedGame(puzzleId: string | number): SavedGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + puzzleId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGameState;
    // Expire saves after 7 days
    if (Date.now() - saved.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SAVE_KEY_PREFIX + puzzleId);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

function saveGame(puzzleId: string | number, state: SavedGameState) {
  try {
    localStorage.setItem(SAVE_KEY_PREFIX + puzzleId, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function clearSavedGame(puzzleId: string | number) {
  try {
    localStorage.removeItem(SAVE_KEY_PREFIX + puzzleId);
  } catch {
    // Ignore
  }
}

interface GameBoardProps {
  puzzle: Puzzle;
  onComplete: (
    totalGuesses: number,
    medal: Medal | null,
    usedClue: boolean,
    magnetsUsed: number,
    rows: CompletedRow[],
    revealedWord?: string,
    revealedDefinition?: string,
    surrendered?: boolean,
    magnetTurns?: number[],
  ) => void;
  onBack: () => void;
  creatorStreak?: number;
  gameMode?: GameMode;
}

export default function GameBoard({
  puzzle,
  onComplete,
  onBack,
  creatorStreak = 0,
  gameMode = "friendly",
}: GameBoardProps) {
  const { user } = useAuth();
  const wordLength = puzzle.wordLength || puzzle.word.length;

  // Load saved game state if available
  const saved = getSavedGame(puzzle.id);

  const [completedRows, setCompletedRows] = useState<CompletedRow[]>(
    () => saved?.completedRows || [],
  );
  const [grid, setGrid] = useState<GridCell[]>(() => emptyGrid(wordLength));
  const [letterStates, setLetterStates] = useState<LetterStates>(
    () => saved?.letterStates || {},
  );
  const [gameOver, setGameOver] = useState(false);
  const [shake, setShake] = useState(false);
  const [revealingRow, setRevealingRow] = useState(-1);
  const [revealedCount, setRevealedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [clueRevealed, setClueRevealed] = useState(
    () => saved?.clueRevealed || false,
  );
  const [showClueDialog, setShowClueDialog] = useState(false);
  const [showShortGuessConfirm, setShowShortGuessConfirm] = useState(false);
  const pendingShortGuess = useRef<GridCell[] | null>(null);
  const [magnetsUsed, setMagnetsUsed] = useState(
    () => saved?.magnetsUsed || 0,
  );
  // Which guess number each magnet was used on (e.g. [3, 5]).
  const [magnetTurns, setMagnetTurns] = useState<number[]>(
    () => saved?.magnetTurns || [],
  );
  const [magnetMode, setMagnetMode] = useState(false);
  const [showMagnetConfirm, setShowMagnetConfirm] = useState(false);
  const [hintedCells, setHintedCells] = useState<Record<number, string>>(
    () => saved?.hintedCells || {},
  );
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState("");
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [surrendering, setSurrendering] = useState(false);

  // Prevents a double-fired magnet tap from counting one use twice. Mobile can
  // fire touch + click, sending two requests before `magnetsUsed` updates,
  // which pushed the count past the allowed max and broke the saved result.
  const magnetInFlightRef = useRef(false);
  // Set true the instant the game reaches a terminal state. The save-effect
  // fires on the completedRows update inside processGuessResult — before
  // `gameOver` flips ~3s later — so without this it would re-persist (and on
  // reopen resurrect) a finished game, letting guesses run past the 6 cap.
  const gameEndedRef = useRef(false);

  // Server-side evaluation for real puzzles (including daily) from other users.
  // Own puzzles and mock/local puzzles use client-side evaluation.
  const isOwnPuzzle = !!user && puzzle.creator_id === user.id;
  const isDaily = gameMode === "daily";
  const useServerEval = typeof puzzle.id === "string" && puzzle.id.length > 10 && !isOwnPuzzle;

  // Persist game state to localStorage whenever key state changes
  useEffect(() => {
    // Don't save if the game has ended or there's no progress. gameEndedRef is
    // checked because gameOver flips ~3s after the terminal guess, and this
    // effect would otherwise re-save the just-cleared state.
    if (gameEndedRef.current || gameOver || completedRows.length === 0) return;
    saveGame(puzzle.id, {
      completedRows,
      letterStates,
      clueRevealed,
      magnetsUsed,
      magnetTurns,
      hintedCells,
      savedAt: Date.now(),
    });
  }, [puzzle.id, completedRows, letterStates, clueRevealed, magnetsUsed, magnetTurns, hintedCells, gameOver]);

  // Dynamic tile sizing — measure grid area and compute tile size to fill it
  const gridRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);

  useEffect(() => {
    const measure = () => {
      const el = gridRef.current;
      if (!el) return;
      const availW = el.clientWidth;
      // Subtract the 24px message bar from available height
      const availH = el.clientHeight - 24;
      if (availH <= 0) return;
      const gap = 6;
      // Max tile width: fill the row (wordLength tiles + gaps)
      const maxByWidth = Math.floor((availW - gap * (wordLength - 1)) / wordLength);
      // Max tile height: fill all 6 rows + gaps vertically
      const maxByHeight = Math.floor((availH - gap * (MAX_GUESSES - 1)) / MAX_GUESSES);
      // Use the smaller of the two, with a minimum floor
      const size = Math.max(32, Math.min(maxByWidth, maxByHeight));
      setTileSize(size);
    };
    // Measure once after layout settles — no resize listener to avoid
    // mobile scroll-triggered resizing (address bar show/hide changes viewport)
    const timer = setTimeout(measure, 50);
    return () => clearTimeout(timer);
  }, [wordLength]);

  const tileGap = tileSize > 44 ? 6 : 4;

  const totalCount = completedRows.length;
  const filledCount = grid.filter((c) => c.letter).length;
  const hasPins = grid.some((c) => c.pinned);
  const isShort = filledCount > 0 && filledCount < wordLength;

  // Positions the player already knows are correct — greens from past guesses
  // and earlier magnet reveals. The magnet must never spend itself surfacing
  // one of these (e.g. a second "A" must not reveal an "A" already locked in).
  const knownCorrect: Record<number, string> = {};
  completedRows.forEach((row) => {
    row.result.forEach((cell, i) => {
      if (cell.status === "correct" && cell.letter) knownCorrect[i] = cell.letter;
    });
  });
  for (const [pos, letter] of Object.entries(hintedCells)) {
    knownCorrect[Number(pos)] = letter;
  }

  // Letters eligible for magnet: present OR correct, with at least one position
  // the player doesn't already know. For server-eval puzzles the answer is
  // hidden, so we can't check positions client-side — just allow any
  // present/correct letter (the server skips positions we report as known).
  const magnetEligibleLetters = Object.entries(letterStates)
    .filter(([ch, s]) => {
      if (s !== "present" && s !== "correct") return false;
      if (useServerEval) return true;
      const answerLetters = puzzle.word.split("");
      for (let i = 0; i < wordLength; i++) {
        if (answerLetters[i] === ch && knownCorrect[i] !== ch) return true;
      }
      return false;
    })
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

  const useMagnet = async (ch: string) => {
    // Cap at 2 and ignore a tap that's already in flight. A mobile double-fire
    // (touch + click) would otherwise count one use twice and push magnets_used
    // past the allowed max, which fails the server-side save of the result.
    if (magnetInFlightRef.current || magnetsUsed >= 2) {
      setMagnetMode(false);
      return;
    }
    magnetInFlightRef.current = true;
    if (useServerEval) {
      // Server-side magnet — don't expose the answer
      setEvaluating(true);
      try {
        // Report known-correct positions as pinned with their letter so the
        // server won't reveal a position the player already has (e.g. a second
        // "A" must not surface an "A" they've already locked in).
        const currentGrid = grid.map((c, i) =>
          knownCorrect[i]
            ? { letter: knownCorrect[i], position: i, pinned: true }
            : { letter: c.letter, position: i, pinned: c.pinned },
        );
        const result = await useMagnetServer({
          puzzle_id: puzzle.id as string,
          letter: ch,
          current_grid: currentGrid,
        });
        setEvaluating(false);
        const tp = result.position;
        setHintedCells((prev) => ({ ...prev, [tp]: ch }));
        setMagnetsUsed((prev) => prev + 1);
        setMagnetTurns((prev) => [...prev, totalCount + 1]);
        setMagnetMode(false);
        showMsg(
          magnetsUsed === 0
            ? "🧲 Magnet used — 25% penalty"
            : "🧲 Magnet used — 50% penalty",
        );
      } catch (err) {
        setEvaluating(false);
        const msg = err instanceof Error ? err.message : "Magnet failed";
        if (msg === "Already placed") {
          showMsg("Already revealed!");
        } else if (msg.includes("Session expired")) {
          setEvalError("Session expired — signing in...");
        } else {
          showMsg("Magnet error — try again");
        }
        setMagnetMode(false);
      } finally {
        magnetInFlightRef.current = false;
      }
    } else {
      // Client-side magnet (mock/local puzzles)
      const answerLetters = puzzle.word.split("");
      const correctPositions: number[] = [];
      for (let i = 0; i < wordLength; i++) {
        if (answerLetters[i] === ch) correctPositions.push(i);
      }
      let targetPos: number | null = null;
      for (const pos of correctPositions) {
        if (knownCorrect[pos] !== ch) {
          targetPos = pos;
          break;
        }
      }
      if (targetPos === null) {
        showMsg("Already revealed!");
        setMagnetMode(false);
        magnetInFlightRef.current = false;
        return;
      }

      setHintedCells((prev) => ({ ...prev, [targetPos!]: ch }));
      setMagnetsUsed((prev) => prev + 1);
      setMagnetTurns((prev) => [...prev, totalCount + 1]);
      setMagnetMode(false);
      showMsg(
        magnetsUsed === 0
          ? "🧲 Magnet used — 25% penalty"
          : "🧲 Magnet used — 50% penalty",
      );
      magnetInFlightRef.current = false;
    }
  };

  // Process result from either server or client evaluation
  const processGuessResult = useCallback(
    (
      rowResult: ResultCell[],
      solved: boolean,
      newTotal: number,
      newRows: CompletedRow[],
      revealedWord?: string,
      revealedDefinition?: string,
      surrendered = false,
    ) => {
      setCompletedRows(newRows);
      setGrid(emptyGrid(wordLength));

      // Sequential reveal with synced keyboard updates
      setRevealingRow(newRows.length - 1);
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
        // Mark terminal synchronously so the save-effect (which fires on the
        // setCompletedRows above, before gameOver flips) can't re-persist and
        // resurrect a finished game on reopen.
        gameEndedRef.current = true;
        // Clear saved game state — puzzle is complete
        clearSavedGame(puzzle.id);
        setTimeout(() => {
          setGameOver(true);
          onComplete(
            newTotal,
            getMedal(newTotal, solved),
            clueRevealed,
            magnetsUsed,
            newRows,
            revealedWord,
            revealedDefinition,
            surrendered,
            magnetTurns,
          );
        }, revealDuration + 400);
      }
      setTimeout(() => setRevealingRow(-1), revealDuration);
    },
    [wordLength, onComplete, clueRevealed, magnetsUsed, magnetTurns, puzzle.id],
  );

  // Submit guess (async for server evaluation)
  const submitGuess = useCallback(
    async (currentGrid: GridCell[], skipShortConfirm = false) => {
      const filledCells = currentGrid.filter((c) => c.letter);
      if (filledCells.length < 2) {
        setShake(true);
        showMsg("Enter at least 2 letters");
        setTimeout(() => setShake(false), 400);
        return;
      }

      // Confirm before submitting a guess shorter than the puzzle length
      if (!skipShortConfirm && filledCells.length < wordLength) {
        pendingShortGuess.current = currentGrid.map((c) => ({ ...c }));
        setShowShortGuessConfirm(true);
        return;
      }

      // Dictionary validation for all guesses (short and full-length)
      const isFull = filledCells.length === wordLength;
      const guessWord = currentGrid
        .filter((c) => c.letter)
        .map((c) => c.letter)
        .join("");
      setEvaluating(true);
      const dictResult = await lookupWord(guessWord);
      setEvaluating(false);

      // Log every submission on real shared friendly puzzles (skip mock/local,
      // own, and daily). Fire-and-forget — never blocks gameplay.
      if (useServerEval && !isDaily) {
        void logSubmission(puzzle.id as string, !!dictResult);
      }

      if (!dictResult) {
        setShake(true);
        showMsg("Not a valid word");
        setTimeout(() => setShake(false), 400);
        return;
      }

      const newTotal = totalCount + 1;

      if (useServerEval) {
        // Server-side evaluation — answer never leaves the server
        setEvaluating(true);
        setEvalError("");
        try {
          const guessCells = currentGrid
            .map((c, i) => ({ letter: c.letter, position: i }))
            .filter((c) => c.letter);

          // On the final guess, send the prior guesses so the server can detect
          // a phoned-in "gave up" finish from how many locked greens were kept.
          const priorGuesses =
            newTotal >= MAX_GUESSES
              ? completedRows.map((row) =>
                  row.result
                    .map((cell, pos) => ({ letter: cell.letter, position: pos }))
                    .filter((c) => c.letter),
                )
              : undefined;

          const response = await evaluateGuess({
            puzzle_id: puzzle.id as string,
            guess_cells: guessCells,
            used_clue: clueRevealed,
            magnets_used: magnetsUsed,
            guess_number: newTotal,
            is_daily: isDaily,
            prior_guesses: priorGuesses,
          });

          // Convert server result to our ResultCell format
          const rowResult: ResultCell[] = Array.from({ length: wordLength }, (_, i) => {
            const serverCell = response.result.find((c: { position: number }) => c.position === i);
            return {
              letter: serverCell?.letter || "",
              status: serverCell?.status || null,
            };
          });

          const solved = !!response.solved;
          const newRows = [...completedRows, { result: rowResult }];

          setEvaluating(false);
          processGuessResult(
            rowResult,
            solved,
            newTotal,
            newRows,
            response.game_over ? response.word : undefined,
            response.game_over ? response.definition : undefined,
            !!response.surrendered,
          );
        } catch (err) {
          setEvaluating(false);
          const msg = err instanceof Error ? err.message : "Evaluation failed";
          if (msg === "Already completed this puzzle") {
            setEvalError("You've already completed this puzzle.");
            showMsg("Already completed!");
          } else if (msg.includes("Session expired")) {
            setEvalError("Session expired — signing in...");
          } else {
            setEvalError(msg);
            showMsg("Error — try again");
          }
        }
      } else {
        // Client-side evaluation (fallback for mock/local puzzles)
        const guessWord = currentGrid.map((c) => c.letter).join("");

        const rowResult = evaluateCells(currentGrid, puzzle.word);
        const solved = isFull && guessWord === puzzle.word;
        const newRows = [...completedRows, { result: rowResult }];

        processGuessResult(rowResult, solved, newTotal, newRows);
      }
    },
    [
      totalCount,
      useServerEval,
      isDaily,
      puzzle.id,
      puzzle.word,
      clueRevealed,
      magnetsUsed,
      wordLength,
      completedRows,
      processGuessResult,
    ],
  );

  // Explicit in-game surrender (the white flag). Records the attempt as
  // surrendered and reveals the answer.
  const handleSurrender = async () => {
    setShowSurrenderConfirm(false);
    setSurrendering(true);
    setEvalError("");
    try {
      const res = await surrenderGame({
        puzzle_id: puzzle.id as string,
        guess_number: totalCount,
        used_clue: clueRevealed,
        magnets_used: magnetsUsed,
      });
      setSurrendering(false);
      gameEndedRef.current = true;
      clearSavedGame(puzzle.id);
      setGameOver(true);
      onComplete(
        totalCount,
        null,
        clueRevealed,
        magnetsUsed,
        completedRows,
        res.word,
        res.definition,
        true,
        magnetTurns,
      );
    } catch (err) {
      setSurrendering(false);
      const msg = err instanceof Error ? err.message : "Couldn't record surrender";
      setEvalError(msg.includes("Session expired") ? "Session expired — signing in..." : msg);
    }
  };

  const handleKey = useCallback(
    (key: string) => {
      if (gameOver || revealingRow !== -1 || evaluating) return;
      if (magnetMode) return;

      if (key === "⌫" || key === "Backspace") {
        removeLetter();
        return;
      }

      if (key === "ENTER" || key === "Enter") {
        submitGuess(grid);
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
      gameOver,
      revealingRow,
      evaluating,
      wordLength,
      submitGuess,
      magnetMode,
      hasPins,
      filledCount,
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
        <div className="flex justify-center" style={{ gap: `${tileGap}px` }}>
          {row.result.map((cell, ci) => {
            const revealed = !isRevealing || ci < revealedCount;
            return (
              <Tile
                key={ci}
                letter={cell.letter}
                status={revealed ? cell.status : null}
                isActive={false}
                isRevealing={isRevealing && ci === revealedCount - 1}
                size={tileSize || undefined}
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
        <div className="flex justify-center" style={{ gap: `${tileGap}px` }}>
          {grid.map((cell, i) => (
            <Tile
              key={i}
              letter={cell.letter}
              status={null}
              isActive={hasContent ? !!cell.letter : i === 0}
              isRevealing={false}
              pinned={cell.pinned}
              hintLetter={hintedCells[i]}
              size={tileSize || undefined}
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
            size={tileSize || undefined}
            gap={tileGap}
          />
        </div>,
      );
    }
  }

  return (
    <div className="flex flex-col h-full mx-auto px-1.5">
      {/* Header */}
      <div className="flex items-center justify-between w-full shrink-0 py-1">
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
          className="font-body flex items-center gap-1.5"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}
        >
          {isDaily ? "Daily Heat" : (puzzle.creator === "You" ? "Your" : `${puzzle.creator}'s`) + " puzzle"}
          {!isDaily && creatorStreak > 0 && puzzle.creator !== "You" && (
            <span
              className="font-mono"
              style={{
                fontSize: "10px",
                color: "rgba(255,140,40,0.85)",
                background: "rgba(255,140,40,0.1)",
                padding: "1px 5px",
                borderRadius: "3px",
                fontWeight: 600,
              }}
            >
              🔥 {creatorStreak}
            </span>
          )}
        </div>
        <div
          className="font-mono"
          style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}
        >
          {totalCount}/{MAX_GUESSES}
        </div>
      </div>

      {/* Grid area — flex-1 to fill available space, grid centered within */}
      <div ref={gridRef} className="flex-1 flex flex-col items-center justify-center min-h-0">
        {/* Message */}
        <div className="h-[24px] flex items-center justify-center shrink-0">
          {evaluating ? (
            <div
              className="font-body"
              style={{
                fontSize: "13px",
                color: "rgba(255,180,60,0.7)",
                background: "rgba(255,180,60,0.08)",
                padding: "4px 16px",
                borderRadius: "6px",
              }}
            >
              Checking...
            </div>
          ) : evalError ? (
            <div
              className="font-body"
              style={{
                fontSize: "13px",
                color: "rgba(255,100,100,0.8)",
                background: "rgba(255,100,100,0.08)",
                padding: "4px 16px",
                borderRadius: "6px",
              }}
            >
              {evalError}
            </div>
          ) : message ? (
            <div
              className="font-body"
              style={{
                fontSize: "13px",
                color: "#f5f0e8",
                background: "rgba(255,255,255,0.12)",
                padding: "4px 16px",
                borderRadius: "6px",
                animation: "fadeUp 0.2s ease",
              }}
            >
              {message}
            </div>
          ) : null}
        </div>

        {/* Grid rows */}
        <div className="flex flex-col items-center" style={{ gap: `${tileGap}px` }}>
          {displayRows}
        </div>
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

      {/* Short guess confirm dialog */}
      {!gameOver && showShortGuessConfirm && (
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
            Your guess is only{" "}
            <strong style={{ color: "rgba(255,180,60,0.9)" }}>
              {grid.filter((c) => c.letter).length} letters
            </strong>{" "}
            (puzzle is {wordLength}). Submit anyway?
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowShortGuessConfirm(false);
                if (pendingShortGuess.current) {
                  submitGuess(pendingShortGuess.current, true);
                  pendingShortGuess.current = null;
                }
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
              Submit
            </button>
            <button
              onClick={() => {
                setShowShortGuessConfirm(false);
                pendingShortGuess.current = null;
              }}
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
              Cancel
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

      {/* Surrender (friendly puzzles only) */}
      {useServerEval && !isDaily && !gameOver && revealingRow === -1 && (
        <div className="w-full flex justify-center shrink-0">
          <button
            onClick={() => setShowSurrenderConfirm(true)}
            disabled={surrendering}
            className="font-body"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: surrendering ? "default" : "pointer",
              fontSize: "13px",
              color: "rgba(255,255,255,0.4)",
              padding: "4px 8px",
            }}
          >
            {surrendering ? "Surrendering…" : "🏳️ Stuck? Wave the white flag"}
          </button>
        </div>
      )}

      {/* Input Panel */}
      <div className="w-full flex justify-center shrink-0 py-0.5">
        <InputPanel
          letterStates={letterStates}
          onKey={handleKey}
          magnetMode={magnetMode}
          onMagnetSelect={useMagnet}
          magnetsUsed={magnetsUsed}
          canMagnet={
            !isDaily &&
            !gameOver &&
            magnetsUsed < 2 &&
            magnetEligibleLetters.length > 0 &&
            !showMagnetConfirm
          }
          magnetEligible={magnetEligibleLetters}
          onMagnetRequest={() => setShowMagnetConfirm(true)}
          onMagnetCancel={() => setMagnetMode(false)}
          hasClue={!!puzzle.hasClue || !!puzzle.clue}
          clueRevealed={clueRevealed}
          onClueRequest={() => {
            if (clueRevealed) {
              setShowClueDialog((p) => !p);
            } else {
              setClueRevealed(true);
              setShowClueDialog(true);
            }
          }}
        />
      </div>

      {/* Pin hint — always reserve the space so keyboard doesn't shift */}
      <div
        className="font-body text-center shrink-0"
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.15)",
          height: "20px",
          visibility:
            !gameOver && filledCount > 0 && !hasPins && totalCount > 0
              ? "visible"
              : "hidden",
        }}
      >
        Tap a letter to pin it in place
      </div>

      {/* Surrender confirm sheet */}
      {showSurrenderConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={() => setShowSurrenderConfirm(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(8,6,4,0.6)", animation: "scrimIn .2s ease" }}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "520px",
              background: "linear-gradient(180deg,#1a1410,#121016)",
              borderTop: "1px solid rgba(255,180,60,0.14)",
              borderRadius: "18px 18px 0 0",
              boxShadow: "0 -16px 50px rgba(0,0,0,0.5)",
              padding: "24px 22px calc(24px + env(safe-area-inset-bottom))",
              animation: "fadeUp .25s ease",
            }}
          >
            <div style={{ fontSize: "32px", textAlign: "center", lineHeight: 1, marginBottom: "10px" }}>🏳️</div>
            <div className="font-display" style={{ fontSize: "19px", fontWeight: 700, textAlign: "center", color: "#f5f0e8", marginBottom: "8px" }}>
              Give up on this one?
            </div>
            <div className="font-body" style={{ fontSize: "13px", lineHeight: 1.5, textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
              It'll show as <span style={{ color: "rgba(255,255,255,0.75)" }}>🏳️ gave up</span> — not a wrong-answer <span style={{ color: "rgba(255,255,255,0.75)" }}>❌</span>. No shame.
            </div>
            <div className="flex flex-col" style={{ gap: "10px" }}>
              <button
                onClick={handleSurrender}
                className="font-body"
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  padding: "13px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                🏳️ Surrender
              </button>
              <button
                onClick={() => setShowSurrenderConfirm(false)}
                className="font-body"
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  padding: "13px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "rgba(255,180,60,0.1)",
                  border: "1px solid rgba(255,180,60,0.3)",
                  color: "rgba(255,180,60,0.9)",
                }}
              >
                Keep trying
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
