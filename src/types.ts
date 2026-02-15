export interface Puzzle {
  id: number;
  word: string;
  creator: string;
  definition: string;
  clue: string | null;
  context: string | null;
  complexity: number;
  submittedAt: string;
}

export interface GridCell {
  letter: string;
  pinned: boolean;
}

export interface ResultCell {
  letter: string;
  status: CellStatus | null;
}

export type CellStatus = "correct" | "present" | "absent";

export type LetterState = "correct" | "present" | "absent" | "unused";

export type LetterStates = Record<string, LetterState>;

export type Medal = "gold" | "silver" | "bronze";

export type CompletionStatus = Medal | "failed" | "submitted";

export interface CompletedRow {
  result: ResultCell[];
}

export interface ResultData {
  totalGuesses: number;
  medal: Medal | null;
  usedClue: boolean;
  magnetsUsed: number;
  rows: CompletedRow[];
}

export interface SubmitWordData {
  word: string;
  definition: string;
  partOfSpeech: string;
  clue: string | null;
  inspo: string;
  complexity: number;
  submittedAt: string;
}

export interface DictionaryEntry {
  partOfSpeech: string;
  definition: string;
}

export type Screen = "select" | "play" | "result" | "submit" | "submitted";

export interface ComplexityRange {
  label: string;
  icon: string;
  color: string;
  bg: string;
}
