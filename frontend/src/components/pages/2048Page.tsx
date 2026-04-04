import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameResult } from "../../types";
import {
  addRandomTile,
  boardToString,
  canMove,
  createEmptyBoard,
  createStartingBoard,
  getMaxTile,
  hasWon,
  moveBoard,
  type Game2048Board,
  type Game2048Direction,
  GAME_2048_SIZE,
} from "../../utils/game2048";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
  routeMode: "settings" | "play";
};

type GameState = "setup" | "playing" | "won" | "lost";

const BEST_SCORE_KEY = "game_2048_best_score";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function keyToDirection(key: string): Game2048Direction | null {
  const normalized = key.toLowerCase();
  if (normalized === "arrowup" || normalized === "w") return "up";
  if (normalized === "arrowdown" || normalized === "s") return "down";
  if (normalized === "arrowleft" || normalized === "a") return "left";
  if (normalized === "arrowright" || normalized === "d") return "right";
  return null;
}

function getTileClass(value: number): string {
  if (value <= 0) return "is-empty";
  if (value <= 2048) return `tile-${value}`;
  return "tile-high";
}

function mapResult(gameState: GameState): GameResult {
  return gameState === "won" ? "win" : "loss";
}

export default function Game2048Page({ authToken, apiBase, onOpenHistory, routeMode }: Props) {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState>("setup");
  const [board, setBoard] = useState<Game2048Board>(() => createEmptyBoard());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());
  const [showResultModal, setShowResultModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState<number>(0);
  const [lastSpawn, setLastSpawn] = useState<{ row: number; col: number } | null>(null);
  const clearSpawnTimerRef = useRef<number | null>(null);

  const maxTile = useMemo(() => getMaxTile(board), [board]);
  const isPlayable = gameState === "playing";
  const status = useMemo(() => {
    if (gameState === "won") return "You reached 2048";
    if (gameState === "lost") return "No moves left";
    if (gameState === "playing") return maxTile >= 2048 ? "You reached 2048" : "Keep combining tiles";
    return "Slide tiles to start";
  }, [gameState, maxTile]);

  useEffect(() => {
    const storedBest = Number(localStorage.getItem(BEST_SCORE_KEY) ?? "0");
    if (Number.isFinite(storedBest) && storedBest > 0) {
      setBestScore(storedBest);
    }
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;

    const interval = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    if (!isPlayable) return;

    function onKeyDown(event: KeyboardEvent) {
      const direction = keyToDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      void handleDirection(direction);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlayable, board, score, moves, elapsedSeconds]);

  useEffect(() => {
    return () => {
      if (clearSpawnTimerRef.current !== null) {
        window.clearTimeout(clearSpawnTimerRef.current);
      }
    };
  }, []);

  async function saveGameIfNeeded(finalState: GameState, finalBoard: Game2048Board, finalScore: number, finalMoves: number) {
    if (!authToken || saved) return;

    setSaving(true);
    try {
      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "2048",
          result: mapResult(finalState),
          difficulty: "medium",
          game_2048_board: boardToString(finalBoard),
          game_2048_score: finalScore,
          game_2048_moves: finalMoves,
          game_2048_max_tile: getMaxTile(finalBoard),
          game_2048_elapsed_seconds: elapsedSeconds,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save 2048 game");
      }

      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save 2048 game");
    } finally {
      setSaving(false);
    }
  }

  function updateBestScore(nextScore: number) {
    if (nextScore <= bestScore) return;
    setBestScore(nextScore);
    localStorage.setItem(BEST_SCORE_KEY, String(nextScore));
  }

  function resetToBoard(nextBoard: Game2048Board) {
    setBoard(nextBoard);
    setLastSpawn(null);
    if (clearSpawnTimerRef.current !== null) {
      window.clearTimeout(clearSpawnTimerRef.current);
    }
    clearSpawnTimerRef.current = window.setTimeout(() => {
      setLastSpawn(null);
    }, 180);
  }

  async function startGame() {
    setError("");
    const starting = createStartingBoard();
    setBoard(starting.board);
    setScore(0);
    setMoves(0);
    setElapsedSeconds(0);
    setStartedAt(new Date().toISOString());
    setGameState("playing");
    setShowResultModal(false);
    setSaved(false);
    navigate("/2048/play");
  }

  async function handleDirection(direction: Game2048Direction) {
    if (!isPlayable) return;

    const moved = moveBoard(board, direction);
    if (!moved.moved) {
      if (!canMove(board)) {
        setGameState("lost");
        setShowResultModal(true);
        void saveGameIfNeeded("lost", board, score, moves);
      }
      return;
    }

    const added = addRandomTile(moved.board);
    const nextBoard = added.board;
    const nextScore = score + moved.scoreGained;
    const nextMoves = moves + 1;

    setScore(nextScore);
    setMoves(nextMoves);
    updateBestScore(nextScore);
    setLastSpawn(added.spawn ? { row: added.spawn.row, col: added.spawn.col } : null);
    resetToBoard(nextBoard);

    if (hasWon(nextBoard)) {
      setGameState("won");
      setShowResultModal(true);
      void saveGameIfNeeded("won", nextBoard, nextScore, nextMoves);
      return;
    }

    if (!canMove(nextBoard)) {
      setGameState("lost");
      setShowResultModal(true);
      void saveGameIfNeeded("lost", nextBoard, nextScore, nextMoves);
    }
  }

  function restartGame() {
    const starting = createStartingBoard();
    setBoard(starting.board);
    setScore(0);
    setMoves(0);
    setElapsedSeconds(0);
    setGameState("playing");
    setShowResultModal(false);
    setSaved(false);
    setStartedAt(new Date().toISOString());
    navigate("/2048/play");
  }

  function backToSettings() {
    setGameState("setup");
    setShowResultModal(false);
    setError("");
    navigate("/2048/settings");
  }

  if (routeMode === "settings") {
    return (
      <section className="board-page game-2048-page">
        <div className="setup-card mode-card game-2048-shell">
          <div className="game-2048-hero">
            <div>
              <p className="game-2048-kicker">Puzzle</p>
              <h2>2048</h2>
              <p>
                Merge matching tiles to reach 2048. Every move spawns a new tile, so plan your merges and keep the board
                open.
              </p>
            </div>
            <div className="game-2048-sample">
              <span>2</span>
              <span>4</span>
              <span>8</span>
              <span>16</span>
            </div>
          </div>

          <div className="game-2048-guides">
            <div className="game-2048-guide">
              <strong>Move</strong>
              <span>Use arrow keys or WASD to slide all tiles at once.</span>
            </div>
            <div className="game-2048-guide">
              <strong>Merge</strong>
              <span>Matching tiles combine into one larger tile and score points.</span>
            </div>
            <div className="game-2048-guide">
              <strong>Win</strong>
              <span>Reach the 2048 tile to complete the game.</span>
            </div>
            <div className="game-2048-guide">
              <strong>Lose</strong>
              <span>When no moves remain, the board is locked and the run ends.</span>
            </div>
          </div>

          <button className="btn btn-dark game-2048-start" onClick={() => void startGame()}>
            Start Game
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="board-page game-2048-page">
      <div className="setup-card mode-card game-2048-shell">
        <div className="game-2048-toolbar">
          <div>
            <p className="game-2048-kicker">Puzzle</p>
            <h2>2048</h2>
          </div>
          <div className="game-2048-stats">
            <div>
              <span>Score</span>
              <strong>{score}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{bestScore}</strong>
            </div>
            <div>
              <span>Moves</span>
              <strong>{moves}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{formatElapsed(elapsedSeconds)}</strong>
            </div>
          </div>
        </div>

        <div className="game-2048-status">
          <div>
            <strong>{status}</strong>
            <span>Keyboard controls are active while the board is open.</span>
          </div>
          <button className="btn btn-light" onClick={backToSettings}>
            Back to Setup
          </button>
        </div>

        {error && <p className="error-message">{error}</p>}

        <div className="game-2048-board" style={{ "--cols": GAME_2048_SIZE } as React.CSSProperties}>
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const isSpawn = lastSpawn?.row === rowIndex && lastSpawn?.col === colIndex;
              const cellClasses = ["game-2048-cell", getTileClass(cell), isSpawn ? "is-new" : ""]
                .filter(Boolean)
                .join(" ");

              return (
                <div className={cellClasses} key={`${rowIndex}-${colIndex}`}>
                  {cell > 0 ? cell : ""}
                </div>
              );
            }),
          )}
        </div>

        {showResultModal && (
          <div className="modal-overlay game-2048-modal-overlay">
            <div className="modal modal-result game-2048-modal">
              <div className="modal-content">
                <p className="modal-title">{gameState === "won" ? "2048 Reached" : "Run Complete"}</p>
                <p className="game-2048-modal-subtitle">
                  {gameState === "won"
                    ? "You hit the target tile. Push further if you want a higher personal best."
                    : "No moves are left. Start a new run and keep your board more open."}
                </p>
                <div className="game-2048-modal-stats">
                  <div>
                    <span>Score</span>
                    <strong>{score}</strong>
                  </div>
                  <div>
                    <span>Moves</span>
                    <strong>{moves}</strong>
                  </div>
                  <div>
                    <span>Max Tile</span>
                    <strong>{maxTile}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{formatElapsed(elapsedSeconds)}</strong>
                  </div>
                </div>
                <div className="modal-buttons">
                  <button className="btn btn-dark" onClick={restartGame}>
                    Play Again
                  </button>
                  <button className="btn btn-light" onClick={onOpenHistory}>
                    View History
                  </button>
                </div>
                {saving && <p style={{ marginTop: "8px", fontSize: "0.9rem" }}>Saving...</p>}
                {!saving && saved && <p className="game-2048-modal-saved">Saved to Analyze Games.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
