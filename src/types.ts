export interface Puzzle {
  id: string | number;
  word: string;
  creator: string;
  creator_id?: string;
  definition: string;
  clue: string | null;
  context: string | null;
  complexity: number;
  submittedAt: string;
  wordLength?: number;
  hasClue?: boolean;
  hasAttempted?: boolean;
  isPublic?: boolean;
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
  puzzleId: string;
}

export interface DictionaryEntry {
  partOfSpeech: string;
  definition: string;
}

export type Screen = "select" | "play" | "result" | "submit" | "submitted" | "groups" | "people";

export interface ConnectedUser {
  user_id: string;
  username: string;
  display_name: string | null;
  shared_group_count: number;
}

export interface ComplexityRange {
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export interface ActivityItem {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  puzzle_id: string;
  puzzle_creator_username: string;
  word_length: number;
  medal: Medal | null;
  total_guesses: number;
  score: number;
  is_own_puzzle: boolean;
  completed_at: string;
}
