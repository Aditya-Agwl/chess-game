import { useState } from "react";
import type { MouseEvent } from "react";

type Props = {
  onPlayChess: () => void;
  onPlaySudoku: () => void;
  onPlayTicTacToe: () => void;
  onPlayConnectFour: () => void;
  onPlayOthello: () => void;
  onPlayMinesweeper: () => void;
  onPlay2048: () => void;
};

export default function HomePage({
  onPlayChess,
  onPlaySudoku,
  onPlayTicTacToe,
  onPlayConnectFour,
  onPlayOthello,
  onPlayMinesweeper,
  onPlay2048,
}: Props) {
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
      <div className="home-hero">
        <div className="home-hero-copy">
          <h2>Pick a mode.</h2>
          <p className="home-summary">All games in one place. Start with the one you want.</p>
        </div>
      </div>

      <div className="home-grid">
          <button className="home-card-item home-card-primary home-card-chess" onClick={onPlayChess}>
            <span className="universe-kicker">Strategy</span>
            <strong>Chess</strong>
            <span>Engine play, clock, and history.</span>
          </button>
          <button className="home-card-item home-card-sudoku" onClick={onPlaySudoku}>
            <span className="universe-kicker">Logic</span>
            <strong>Sudoku</strong>
            <span>Generate a fresh puzzle.</span>
          </button>
          <button className="home-card-item home-card-ttt" onClick={onPlayTicTacToe}>
            <span className="universe-kicker">Arcade</span>
            <strong>Tic Tac Toe</strong>
            <span>Quick AI matches.</span>
          </button>
          <button className="home-card-item home-card-connect4" onClick={onPlayConnectFour}>
            <span className="universe-kicker">Duel</span>
            <strong>Connect 4</strong>
            <span>Drop discs and connect four.</span>
          </button>
          <button className="home-card-item home-card-othello" onClick={onPlayOthello}>
            <span className="universe-kicker">Tactics</span>
            <strong>Othello</strong>
            <span>Local or AI play.</span>
          </button>
          <button className="home-card-item home-card-minesweeper" onClick={onPlayMinesweeper}>
            <span className="universe-kicker">Puzzle</span>
            <strong>Minesweeper</strong>
            <span>Clear the board safely.</span>
          </button>
          <button className="home-card-item home-card-2048" onClick={onPlay2048}>
            <span className="universe-kicker">Puzzle</span>
            <strong>2048</strong>
            <span>Merge tiles and push your score higher.</span>
          </button>
      </div>
    </section>
  );
}
