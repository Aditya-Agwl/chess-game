import type { CSSProperties } from "react";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { DifficultyLevel, PlayerColor } from "../../types";

type Props = {
  fen: string;
  playerColor: PlayerColor | null;
  difficulty: DifficultyLevel | null;
  gameTurn: "w" | "b";
  loading: boolean;
  status: string;
  bestMove: string;
  error: string;
  squareStyles: Record<string, CSSProperties>;
  toLabel: (value: string) => string;
  onSquareClick: (square: string) => void;
  onPieceDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  onReset: () => void;
};

export default function MatchPage({
  fen,
  playerColor,
  difficulty,
  gameTurn,
  loading,
  status,
  bestMove,
  error,
  squareStyles,
  toLabel,
  onSquareClick,
  onPieceDrop,
  onReset,
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
          <span>Turn:</span>
          <strong>{gameTurn === "w" ? "White" : "Black"}</strong>
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

        <button className="btn btn-reset" onClick={onReset}>
          New Game
        </button>
      </aside>
    </section>
  );
}
