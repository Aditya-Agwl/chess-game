import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MinesweeperBoardSize } from "../../utils/minesweeper";
import {
  MINESWEEPER_CONFIG,
  boardFromString,
  chordCell,
  countRemainingMines,
  getRowCol,
  revealAllMines,
  revealCell,
  stateToString,
  toggleFlag,
} from "../../utils/minesweeper";
import type { GameResult } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
  routeMode: "settings" | "play";
};

type GameState = "setup" | "playing" | "won" | "lost";

function mapBoardSizeToDifficulty(boardSize: MinesweeperBoardSize): "easy" | "medium" | "hard" {
  if (boardSize === "small") return "easy";
  if (boardSize === "large") return "hard";
  return "medium";
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function MinesweeperPage({ authToken, apiBase, onOpenHistory, routeMode }: Props) {
  const navigate = useNavigate();
  const [boardSize, setBoardSize] = useState<MinesweeperBoardSize>("medium");

  const config = MINESWEEPER_CONFIG[boardSize];
  const { rows, cols, mines: totalMines } = config;

  const [gameState, setGameState] = useState<GameState>("setup");

  const [board, setBoard] = useState<string>("");
  const [minesMap, setMinesMap] = useState<string>("");
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [flagged, setFlagged] = useState<boolean[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);

  const remainingMines = useMemo(
    () => (board ? countRemainingMines(boardFromString(board, cols), flagged, rows, cols) : totalMines),
    [board, flagged, rows, cols, totalMines],
  );

  const status = useMemo(() => {
    if (gameState === "won") return "You Win!";
    if (gameState === "lost") return "Game Over!";
    if (gameState === "playing") return `${remainingMines} mines left`;
    return "Choose difficulty to start";
  }, [gameState, remainingMines]);

  // Timer
  useEffect(() => {
    if (gameState !== "playing") return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState]);

  async function saveMinesweeperIfNeeded(finalState: GameState) {
    if (!authToken || saved) return;

    setSaving(true);
    try {
      let result: GameResult = "aborted";
      if (finalState === "won") {
        result = "win";
      } else if (finalState === "lost") {
        result = "loss";
      }

      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "minesweeper",
          result,
          difficulty: mapBoardSizeToDifficulty(boardSize),
          minesweeper_board_size: boardSize,
          minesweeper_board: board,
          minesweeper_mines: minesMap,
          minesweeper_revealed: stateToString(revealed),
          minesweeper_flagged: stateToString(flagged),
          minesweeper_winner: finalState === "won" ? "player" : undefined,
          minesweeper_elapsed_seconds: elapsedSeconds,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save Minesweeper game");
      }

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Minesweeper game");
    } finally {
      setSaving(false);
    }
  }

  async function initializeGame() {
    setError("");
    try {
      const res = await fetch(apiBase + "/minesweeper/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_size: boardSize }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate board");
      }

      const data: { board: string; mines: string } = await res.json();
      const totalCells = rows * cols;

      setBoard(data.board);
      setMinesMap(data.mines);
      setRevealed(new Array(totalCells).fill(false));
      setFlagged(new Array(totalCells).fill(false));
      setElapsedSeconds(0);
      setStartedAt(new Date().toISOString());
      setGameState("playing");
      setShowResultModal(false);
      setSaved(false);
      navigate("/minesweeper/play");
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start game");
    }
  }

  function handleCellClick(index: number, button: "left" | "right" | "chord") {
    if (gameState !== "playing" || !board) return;

    const boardGrid = boardFromString(board, cols);
    const revealedCopy = [...revealed];
    const flaggedCopy = [...flagged];

    let result: { lost?: boolean; won?: boolean } = {};

    if (button === "left") {
      result = revealCell(boardGrid, revealedCopy, flaggedCopy, index, rows, cols);
    } else if (button === "right") {
      result = toggleFlag(revealedCopy, flaggedCopy, index);
    } else if (button === "chord") {
      result = chordCell(boardGrid, revealedCopy, flaggedCopy, index, rows, cols);
    }

    if (result.lost) {
      revealAllMines(boardGrid, revealedCopy, rows, cols);
      setRevealed(revealedCopy);
      setFlagged(flaggedCopy);
      setGameState("lost");
      setShowResultModal(true);
      void saveMinesweeperIfNeeded("lost");
      return;
    }

    setRevealed(revealedCopy);
    setFlagged(flaggedCopy);

    if (result.won) {
      setGameState("won");
      setShowResultModal(true);
      void saveMinesweeperIfNeeded("won");
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    const isLeftDown = (e.buttons & 1) !== 0;
    const isRightDown = (e.buttons & 2) !== 0;

    if (isLeftDown && isRightDown) {
      e.preventDefault();
      handleCellClick(index, "chord");
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    handleCellClick(index, "right");
  }

  function resetGame() {
    setGameState("setup");
    setBoard("");
    setRevealed([]);
    setFlagged([]);
    navigate("/minesweeper/settings");
    setElapsedSeconds(0);
    setShowResultModal(false);
    setSaved(false);
    setError("");
  }

  // Settings page
  if (routeMode === "settings") {
    return (
      <section className="board-page minesweeper-page">
        <div className="setup-card mode-card home-card">
          <h2>Minesweeper</h2>
          <p>Clear the board while avoiding mines. First to explore safe cells reveals the pattern.</p>

          <div className="mode-select">
            <h3>How to Play</h3>
            <div className="how-to-play">
              <div className="rule">
                <strong>Left Click</strong> — Reveal a cell. If it has 0 adjacent mines, all surrounding cells auto-reveal.
              </div>
              <div className="rule">
                <strong>Right Click</strong> — Place or remove a flag to mark suspected mines.
              </div>
              <div className="rule">
                <strong>Left + Right Click</strong> — Chord: If flags equal the mine count, auto-reveal adjacent cells.
              </div>
              <div className="rule">
                <strong>Numbers</strong> — Shows how many mines are adjacent to that cell (1-8).
              </div>
              <div className="rule">
                <strong>Win Condition</strong> — Reveal all non-mine cells AND flag all mines.
              </div>
              <div className="rule">
                <strong>Lose Condition</strong> — Click on a mine.
              </div>
            </div>

            <h3 style={{ marginTop: "20px" }}>Choose Difficulty:</h3>
            <div className="difficulty-buttons">
              <button
                className={`btn ${boardSize === "small" ? "btn-dark" : "btn-light"}`}
                onClick={() => setBoardSize("small")}
              >
                <strong>Small</strong>
                <span>8×8, 10 mines</span>
              </button>
              <button
                className={`btn ${boardSize === "medium" ? "btn-dark" : "btn-light"}`}
                onClick={() => setBoardSize("medium")}
              >
                <strong>Medium</strong>
                <span>9×9, 10 mines</span>
              </button>
              <button
                className={`btn ${boardSize === "large" ? "btn-dark" : "btn-light"}`}
                onClick={() => setBoardSize("large")}
              >
                <strong>Large</strong>
                <span>16×30, 99 mines</span>
              </button>
            </div>

            {error && <p className="error-message">{error}</p>}

            <button className="btn btn-dark" onClick={initializeGame} style={{ marginTop: "16px" }}>
              Start Game
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Play page
  return (
    <section className="board-page minesweeper-page">
      <div className="setup-card mode-card">
        <h2>Minesweeper</h2>

        <div className="game-info">
          <p>
            <strong>Status:</strong> {status}
          </p>
          <p>
            <strong>Time:</strong> {formatElapsed(elapsedSeconds)}
          </p>
        </div>

        {error && <p className="error-message">{error}</p>}

        {board && (
          <div className="minesweeper-board" style={{ "--cols": cols } as React.CSSProperties}>
            {revealed.map((isRevealed, index) => {
              const isFlagged = flagged[index];
              const boardGrid = boardFromString(board, cols);
              const [row, col] = getRowCol(index, cols);
              const cellValue = boardGrid[row][col];

              let cellContent = "";
              let cellClass = "cell";

              if (isFlagged) {
                cellContent = "🚩";
                cellClass += " flagged";
              } else if (isRevealed) {
                cellClass += " revealed";
                if (cellValue === "M") {
                  cellContent = "💣";
                  cellClass += " mine";
                } else if (cellValue === "0") {
                  cellContent = "";
                } else {
                  cellContent = cellValue;
                  cellClass += ` adjacent-${cellValue}`;
                }
              }

              return (
                <button
                  key={index}
                  className={cellClass}
                  onClick={() => handleCellClick(index, "left")}
                  onContextMenu={e => handleContextMenu(e, index)}
                  onMouseDown={e => handleMouseDown(e, index)}
                  disabled={gameState !== "playing"}
                >
                  {cellContent}
                </button>
              );
            })}
          </div>
        )}

        {showResultModal && (
          <div className="modal-overlay">
            <div className="modal modal-result">
              <div className="modal-content">
                <p className="modal-title">
                  {gameState === "won" ? "🎉 Victory!" : "💥 Game Over"}
                </p>
                <p>
                  You {gameState === "won" ? "won" : "lost"} in {formatElapsed(elapsedSeconds)}.
                </p>
                <div className="modal-buttons">
                  <button className="btn btn-dark" onClick={resetGame}>
                    Play Again
                  </button>
                  <button className="btn btn-light" onClick={onOpenHistory}>
                    View History
                  </button>
                </div>
                {saving && <p style={{ marginTop: "8px", fontSize: "0.9rem" }}>Saving...</p>}
              </div>
            </div>
          </div>
        )}

        <button className="btn btn-light" onClick={resetGame} style={{ marginTop: "16px" }}>
          Back to Setup
        </button>
      </div>
    </section>
  );
}
