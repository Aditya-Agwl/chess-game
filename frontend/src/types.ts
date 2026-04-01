export type PlayerColor = "white" | "black";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type GameResult = "win" | "loss" | "draw" | "aborted";
export type TimeControl = "3+2" | "5+0" | "10+0" | "10+3" | "15+10";
export type GameType = "chess" | "sudoku" | "tictactoe" | "connect4" | "othello";

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
  game_type?: GameType;
  result: GameResult;
  difficulty: DifficultyLevel;
  player_color?: PlayerColor;
  time_control?: TimeControl;
  initial_seconds?: number;
  increment_seconds?: number;
  white_time_left_ms?: number;
  black_time_left_ms?: number;
  timeout_loser?: PlayerColor;
  move_history?: string[];
  final_fen?: string;
  pgn?: string;
  sudoku_puzzle?: string;
  sudoku_solution?: string;
  sudoku_user_grid?: string;
  sudoku_elapsed_seconds?: number;
  sudoku_mistakes?: number;
  tictactoe_board?: string;
  tictactoe_player_mark?: "X" | "O";
  tictactoe_winner?: "X" | "O" | "draw";
  tictactoe_move_history?: string[];
  tictactoe_elapsed_seconds?: number;
  connect4_board?: string;
  connect4_player_disc?: "R" | "Y";
  connect4_winner?: "R" | "Y" | "draw";
  connect4_move_history?: string[];
  connect4_elapsed_seconds?: number;
  othello_board?: string;
  othello_player_disc?: "B" | "W";
  othello_winner?: "B" | "W" | "draw";
  othello_move_history?: string[];
  othello_elapsed_seconds?: number;
  finished_at?: string;
};
