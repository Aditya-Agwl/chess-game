import { useState } from "react";
import type { MouseEvent } from "react";

type Props = {
  onPlayChess: () => void;
  onPlaySudoku: () => void;
  onPlayTicTacToe: () => void;
  onPlayConnectFour: () => void;
  onPlayOthello: () => void;
  onPlayMinesweeper: () => void;
};

export default function HomePage({ onPlayChess, onPlaySudoku, onPlayTicTacToe, onPlayConnectFour, onPlayOthello, onPlayMinesweeper }: Props) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setTilt({
      x: (px - 0.5) * 16,
      y: (py - 0.5) * 16,
    });
  }

  function onLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <section
      className="home-stage"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        ["--tilt-x" as string]: `${tilt.x}px`,
        ["--tilt-y" as string]: `${tilt.y}px`,
      }}
    >
      <div className="chess-floaters" aria-hidden="true">
        <span className="piece p1">♘</span>
        <span className="piece p2">♛</span>
        <span className="piece p3">♞</span>
        <span className="piece p4">♜</span>
        <span className="piece p5">♝</span>
        <span className="piece p6">♔</span>
      </div>

      <div className="setup-card mode-card home-card">
        <h2>Choose Your Universe</h2>
        <p>Enter Chess Command or Sudoku Arena.</p>
        <div className="game-universe-grid">
          <button className="universe-card" onClick={onPlayChess}>
            <span className="universe-kicker">Strategy</span>
            <strong>Chess</strong>
            <span>Play against the engine with time controls and analysis history.</span>
          </button>
          <button className="universe-card universe-card-sudoku" onClick={onPlaySudoku}>
            <span className="universe-kicker">Logic</span>
            <strong>Sudoku</strong>
            <span>Solve generated puzzles with timer and mistakes tracking.</span>
          </button>
          <button className="universe-card universe-card-ttt" onClick={onPlayTicTacToe}>
            <span className="universe-kicker">Arcade</span>
            <strong>Tic Tac Toe</strong>
            <span>Challenge the AI and track wins, losses, and draw streaks.</span>
          </button>
          <button className="universe-card universe-card-connect4" onClick={onPlayConnectFour}>
            <span className="universe-kicker">Duel</span>
            <strong>Connect 4</strong>
            <span>Local two-player mode. Drop discs and connect four to win.</span>
          </button>
          <button className="universe-card universe-card-othello" onClick={onPlayOthello}>
            <span className="universe-kicker">Tactics</span>
            <strong>Othello</strong>
            <span>Play local or versus smart AI with legal-move guidance and post-game history.</span>
          </button>
          <button className="universe-card universe-card-minesweeper" onClick={onPlayMinesweeper}>
            <span className="universe-kicker">Puzzle</span>
            <strong>Minesweeper</strong>
            <span>Clear the board while avoiding hidden mines. Multiple difficulty levels.</span>
          </button>
        </div>
      </div>
    </section>
  );
}
