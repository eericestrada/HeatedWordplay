export type GameMode = "daily" | "friendly";

export type AppRole = "player" | "wordmaster" | "editor";

export type DailyWordStatus = "pending" | "scheduled" | "used" | "skipped";

export interface DailyWord {
  id: string;
  word: string;
  definition: string;
  scheduled_date: string;
  wordLength: number;
}

/** What the client receives before solving — word is hidden */
export interface DailyWordMeta {
  id: string;
  scheduled_date: string;
  wordLength: number;
  definition: string;
}

/** Full word row visible to submitter or editor */
export interface DailyPoolWord {
  id: string;
  word: string;
  definition: string;
  part_of_speech: string;
  status: DailyWordStatus;
  scheduled_date: string | null;
  created_at: string;
}

/** Anonymous entry visible to other WordMasters — no word/definition */
export interface DailyPoolAnonymous {
  id: string;
  word_length: number;
  status: DailyWordStatus;
  submitted_by_username: string;
  submitted_by_display_name: string | null;
  created_at: string;
}

/** Editor schedule slot */
export interface ScheduleSlot {
  date: string;
  word: DailyPoolWord | null;
}

export type DailyHeatState =
  | { status: "unplayed"; streak: number }
  | { status: "completed"; guesses: number; streak: number; rows: CompletedRow[] }
  | { status: "streak_broken" };

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
  shareType?: "user" | "group" | "public";
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

export type Screen = "select" | "play" | "result" | "submit" | "submitted" | "groups" | "people" | "review" | "stats" | "wordmaster" | "editor-schedule";

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

export interface PairStreak {
  partner_id: string;
  partner_username: string;
  partner_display_name: string | null;
  current_streak: number;
  last_activity_date: string;
  total_completions: number;
}

export interface PuzzleStats {
  total_attempts: number;
  total_solved: number;
  avg_guesses: number | null;
  guess_distribution: Record<string, number>;
  solvers: Array<{
    user_id: string;
    username: string;
    display_name: string | null;
    medal: Medal | null;
    total_guesses: number;
    score: number;
    completed_at: string;
  }>;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  total_score: number;
  puzzles_solved: number;
  puzzles_failed: number;
  gold_count: number;
  silver_count: number;
  bronze_count: number;
  avg_guesses: number | null;
  best_score: number;
}

export interface PlayerStats {
  total_attempted: number;
  total_solved: number;
  total_failed: number;
  total_score: number;
  best_score: number;
  gold_count: number;
  silver_count: number;
  bronze_count: number;
  avg_guesses: number | null;
  puzzles_created: number;
  puzzles_played_by_others: number;
  current_solve_streak: number;
}

export interface CreatorStats {
  total_puzzles: number;
  total_plays: number;
  total_solves: number;
  total_fails: number;
  avg_guesses: number | null;
  stump_rate: number;
  puzzles: Array<{
    puzzle_id: string;
    word: string;
    complexity: number;
    created_at: string;
    play_count: number;
    solve_count: number;
    avg_guesses: number | null;
  }>;
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
