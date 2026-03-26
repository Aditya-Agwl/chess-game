export type PlayerColor = "white" | "black";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type GameResult = "win" | "loss" | "draw" | "aborted";
export type TimeControl = "3+2" | "5+0" | "10+0" | "10+3" | "15+10";

export type GameOverModalState = {
  visible: boolean;
  title: string;
  message: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
};

export type SavedGame = {
  id: string;
  result: GameResult;
  difficulty: DifficultyLevel;
  player_color: PlayerColor;
  time_control?: TimeControl;
  initial_seconds?: number;
  increment_seconds?: number;
  white_time_left_ms?: number;
  black_time_left_ms?: number;
  timeout_loser?: PlayerColor;
  move_history: string[];
  final_fen: string;
  pgn?: string;
  finished_at?: string;
};
