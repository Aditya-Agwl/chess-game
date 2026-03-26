import type { CSSProperties } from "react";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { DifficultyLevel, PlayerColor, TimeControl } from "../../types";

type Props = {
  fen: string;
  playerColor: PlayerColor | null;
  difficulty: DifficultyLevel | null;
  timeControl: TimeControl | null;
  gameTurn: "w" | "b";
  loading: boolean;
  status: string;
  bestMove: string;
  whiteClock: string;
  blackClock: string;
  activeClock: "w" | "b";
  error: string;
  canUndo: boolean;
  squareStyles: Record<string, CSSProperties>;
  toLabel: (value: string) => string;
  toTimeControlLabel: (value: TimeControl) => string;
  onSquareClick: (square: string) => void;
  onPieceDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  onUndo: () => void;
  onEndGame: () => void;
};

export default function MatchPage({
  fen,
  playerColor,
  difficulty,
  timeControl,
  gameTurn,
  loading,
  status,
  bestMove,
  whiteClock,
  blackClock,
  activeClock,
  error,
  canUndo,
  squareStyles,
  toLabel,
  toTimeControlLabel,
  onSquareClick,
  onPieceDrop,
  onUndo,
  onEndGame,
}: Props) {
  return (
    <section className="game-grid">
      <div className="board-wrap">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: playerColor ?? undefined,
            squareStyles,
            onSquareClick: ({ square }) => onSquareClick(square),
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (!targetSquare) return false;
              return onPieceDrop(sourceSquare as Square, targetSquare as Square);
            },
          }}
        />
      </div>

      <aside className="panel">
        <h2>Match Console</h2>
        <div className="row">
          <span>You:</span>
          <strong>{playerColor ? toLabel(playerColor) : "-"}</strong>
        </div>
        <div className="row">
          <span>Difficulty:</span>
          <strong>{difficulty ? toLabel(difficulty) : "-"}</strong>
        </div>
        <div className="row">
          <span>Time Control:</span>
          <strong>{timeControl ? toTimeControlLabel(timeControl) : "-"}</strong>
        </div>
        <div className="row">
          <span>Turn:</span>
          <strong>{gameTurn === "w" ? "White" : "Black"}</strong>
        </div>
        <div className="clock-grid">
          <div className={`clock-box ${activeClock === "w" ? "is-active" : ""}`}>
            <span>White</span>
            <strong>{whiteClock}</strong>
          </div>
          <div className={`clock-box ${activeClock === "b" ? "is-active" : ""}`}>
            <span>Black</span>
            <strong>{blackClock}</strong>
          </div>
        </div>
        <div className="row">
          <span>Status:</span>
          <strong>{loading ? "Computer thinking..." : status}</strong>
        </div>
        <div className="row">
          <span>Engine Move:</span>
          <strong>{bestMove || "-"}</strong>
        </div>

        <div className="fen-block">
          <span>FEN</span>
          <code>{fen}</code>
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn btn-light" onClick={onUndo} disabled={!canUndo}>
          Undo Last Turn
        </button>

        <button className="btn btn-reset" onClick={onEndGame}>
          End Game (Counts as Loss)
        </button>
      </aside>
    </section>
  );
}
