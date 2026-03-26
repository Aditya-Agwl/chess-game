export type PlayerColor = "white" | "black";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type GameResult = "win" | "loss" | "draw" | "aborted";

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
  move_history: string[];
  final_fen: string;
  pgn?: string;
  finished_at?: string;
};
