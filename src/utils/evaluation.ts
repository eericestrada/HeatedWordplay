import type { GridCell, ResultCell } from "../types";

export function evaluateCells(
  cells: GridCell[],
  answer: string,
): ResultCell[] {
  const answerLetters = answer.split("");
  const wordLength = answer.length;

  const rowResult: ResultCell[] = cells.map((c) =>
    c.letter
      ? { letter: c.letter, status: "absent" as const }
      : { letter: "", status: null },
  );

  const letterBudget: Record<string, number> = {};
  answerLetters.forEach((ch) => {
    letterBudget[ch] = (letterBudget[ch] || 0) + 1;
  });

  // First pass: mark correct positions
  for (let i = 0; i < wordLength; i++) {
    if (rowResult[i].letter && rowResult[i].letter === answerLetters[i]) {
      rowResult[i] = { ...rowResult[i], status: "correct" };
      letterBudget[rowResult[i].letter]--;
    }
  }

  // Second pass: mark present letters
  for (let i = 0; i < wordLength; i++) {
    if (!rowResult[i].letter || rowResult[i].status === "correct") continue;
    const ch = rowResult[i].letter;
    if (letterBudget[ch] && letterBudget[ch] > 0) {
      rowResult[i] = { ...rowResult[i], status: "present" };
      letterBudget[ch]--;
    }
  }

  return rowResult;
}
