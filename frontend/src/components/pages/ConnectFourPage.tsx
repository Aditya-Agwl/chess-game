import { useEffect, useMemo, useState } from "react";
import {
  CONNECT4_COLS,
  CONNECT4_ROWS,
  createConnect4Board,
  dropDisc,
  isBoardFull,
  isWinningMove,
  type Connect4Disc,
  type Connect4Winner,
} from "../../utils/connect4";
import type { DifficultyLevel, GameResult } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
};

type GameMode = "setup" | "local" | "ai";

function labelForDisc(disc: Connect4Disc): string {
  return disc === "R" ? "Red" : "Yellow";
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function boardToString(board: (Connect4Disc | "")[][]): string {
  return board.flat().map(cell => cell === "" ? "-" : cell).join("");
}

export default function ConnectFourPage({ authToken, apiBase, onOpenHistory }: Props) {
  const [gameMode, setGameMode] = useState<GameMode>("setup");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [playerDisc, setPlayerDisc] = useState<Connect4Disc>("R");
  const [gameStarted, setGameStarted] = useState(false);
  
  const [board, setBoard] = useState(createConnect4Board);
  const [currentPlayer, setCurrentPlayer] = useState<Connect4Disc>("R");
  const [winner, setWinner] = useState<Connect4Winner>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastMove, setLastMove] = useState<{ row: number; column: number } | null>(null);
  
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());

  const gameOver = winner !== null;
  const isAiGame = gameMode === "ai";
  const isPlayerTurn = currentPlayer === playerDisc;
  const aiDisc: Connect4Disc = playerDisc === "R" ? "Y" : "R";
  
  const status = useMemo(() => {
    if (winner === "draw") return "Draw game. Board is full.";
    if (winner === "R" || winner === "Y") {
      const isPlayerWinner = winner === playerDisc;
      return isPlayerWinner ? "You win!" : `${labelForDisc(winner)} wins!`;
    }
    if (isAiGame && loadingAi) return "AI is thinking...";
    return `${labelForDisc(currentPlayer)}'s turn.`;
  }, [winner, currentPlayer, gameMode, loadingAi, playerDisc]);

  async function saveConnect4IfNeeded(forcedWinner?: Connect4Winner) {
    if (!authToken || saved) return;

    setSaving(true);
    try {
      const resolvedWinner = forcedWinner ?? winner;
      let result: GameResult = "aborted";
      if (resolvedWinner === "draw") {
        result = "draw";
      } else if (resolvedWinner) {
        result = resolvedWinner === playerDisc ? "win" : "loss";
      }

      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "connect4",
          result,
          difficulty,
          connect4_board: boardToString(board),
          connect4_player_disc: playerDisc,
          connect4_winner: resolvedWinner ?? undefined,
          connect4_move_history: moveHistory,
          connect4_elapsed_seconds: elapsedSeconds,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save Connect 4 game");
      }

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Connect 4 game");
    } finally {
      setSaving(false);
    }
  }

  function startNewGame() {
    setBoard(createConnect4Board());
    setCurrentPlayer("R");
    setWinner(null);
    setMoveHistory([]);
    setElapsedSeconds(0);
    setLastMove(null);
    setLoadingAi(false);
    setError("");
    setSaving(false);
    setSaved(false);
    setShowResultModal(false);
    setStartedAt(new Date().toISOString());
    setGameStarted(true);

    // If AI goes first, request AI move
    if (isAiGame && playerDisc !== "R") {
      setLoadingAi(true);
      window.setTimeout(() => {
        void requestAiMove(createConnect4Board(), [], "R");
      }, 0);
    }
  }

  async function requestAiMove(nextBoard: (Connect4Disc | "")[][], history: string[], aiTurn: Connect4Disc) {
    setLoadingAi(true);
    setError("");
    try {
      const res = await fetch(apiBase + "/connect4/best-move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board: boardToString(nextBoard),
          difficulty,
          ai_disc: aiTurn,
        }),
      });

      const data: { column?: number; detail?: string } = await res.json();
      if (!res.ok || data.column === undefined) {
        throw new Error(data.detail || "Could not fetch AI move");
      }

      const column = data.column;
      const dropped = dropDisc(nextBoard, column, aiTurn);
      if (!dropped) {
        throw new Error("AI returned invalid move");
      }

      const { board: afterAi, row } = dropped;
      const aiRow = Math.floor(column) + 1;
      const updatedHistory = [...history, `${labelForDisc(aiTurn)} -> C${aiRow}`];
      const nextWinner = isWinningMove(afterAi, row, column, aiTurn) ? aiTurn : null;

      setBoard(afterAi);
      setMoveHistory(updatedHistory);
      setLastMove({ row, column });

      if (nextWinner) {
        setWinner(nextWinner);
        setShowResultModal(true);
        void saveConnect4IfNeeded(nextWinner);
        return;
      }

      if (isBoardFull(afterAi)) {
        setWinner("draw");
        setShowResultModal(true);
        void saveConnect4IfNeeded("draw");
        return;
      }

      setCurrentPlayer(playerDisc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch AI move");
    } finally {
      setLoadingAi(false);
    }
  }

  function playColumn(column: number) {
    if (gameOver || loadingAi) return;
    if (isAiGame && !isPlayerTurn) return;

    const dropped = dropDisc(board, column, currentPlayer);
    if (!dropped) return;

    const { board: nextBoard, row } = dropped;
    const nextHistory = [...moveHistory, `${labelForDisc(currentPlayer)} -> C${column + 1}`];

    setBoard(nextBoard);
    setMoveHistory(nextHistory);
    setLastMove({ row, column });

    if (isWinningMove(nextBoard, row, column, currentPlayer)) {
      setWinner(currentPlayer);
      setShowResultModal(true);
      void saveConnect4IfNeeded(currentPlayer);
      return;
    }

    if (isBoardFull(nextBoard)) {
      setWinner("draw");
      setShowResultModal(true);
      void saveConnect4IfNeeded("draw");
      return;
    }

    const nextPlayer: Connect4Disc = currentPlayer === "R" ? "Y" : "R";
    setCurrentPlayer(nextPlayer);

    if (isAiGame && nextPlayer === aiDisc) {
      void requestAiMove(nextBoard, nextHistory, nextPlayer);
    }
  }

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const id = window.setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [gameStarted, gameOver]);

  if (!gameStarted) {
    // Setup screen: choose mode
    if (gameMode === "setup") {
      return (
        <section className="setup-card">
          <h2>Connect 4 Arena</h2>
          <p>Choose your game mode.</p>

          <h3 className="setup-subtitle">Game Mode</h3>
          <div className="mode-actions">
            <button
              className="btn btn-light"
              onClick={() => {
                setGameMode("local");
                setGameStarted(true);
              }}
            >
              Local 2-Player
            </button>
            <button
              className="btn btn-dark"
              onClick={() => setGameMode("ai")}
            >
              Play vs AI
            </button>
          </div>
        </section>
      );
    }

    // AI mode: let user choose color and difficulty
    if (gameMode === "ai") {
      return (
        <section className="setup-card">
          <h2>Connect 4 vs AI</h2>
          <p>Choose your color and difficulty.</p>

          <h3 className="setup-subtitle">Your Color</h3>
          <div className="setup-actions">
            <button
              className={`btn btn-light ${playerDisc === "R" ? "is-selected" : ""}`}
              onClick={() => setPlayerDisc("R")}
            >
              Red
            </button>
            <button
              className={`btn btn-dark ${playerDisc === "Y" ? "is-selected" : ""}`}
              onClick={() => setPlayerDisc("Y")}
            >
              Yellow
            </button>
          </div>
          <div className="selection-hint">
            {playerDisc ? `Playing as ${labelForDisc(playerDisc)}` : "Select a color"}
          </div>

          <h3 className="setup-subtitle">Difficulty</h3>
          <div className="difficulty-actions">
            <button
              className={`btn btn-difficulty ${difficulty === "easy" ? "is-selected" : ""}`}
              onClick={() => setDifficulty("easy")}
            >
              Easy
            </button>
            <button
              className={`btn btn-difficulty ${difficulty === "medium" ? "is-selected" : ""}`}
              onClick={() => setDifficulty("medium")}
            >
              Medium
            </button>
            <button
              className={`btn btn-difficulty ${difficulty === "hard" ? "is-selected" : ""}`}
              onClick={() => setDifficulty("hard")}
            >
              Hard
            </button>
          </div>
          <div className="selection-hint">
            {difficulty ? `Difficulty: ${difficulty[0].toUpperCase() + difficulty.slice(1)}` : "Select difficulty"}
          </div>

          <button
            className="btn btn-start"
            onClick={() => {
              startNewGame();
            }}
          >
            Start Game
          </button>
        </section>
      );
    }
  }


  return (
    <section className="connect4-page setup-card">
      <div className="sudoku-header">
        <h2>Connect 4 Arena</h2>
        <p>{isAiGame ? `Playing vs AI (${difficulty})` : "Local 2-player mode"}. Drop discs and connect four to win.</p>
      </div>

      <div className="sudoku-stats">
        <span>Mode: <strong>{isAiGame ? "vs AI" : "Local"}</strong></span>
        <span>Status: <strong>{gameOver ? "Finished" : "In Progress"}</strong></span>
        <span>Turn: <strong>{gameOver ? "-" : labelForDisc(currentPlayer)}</strong></span>
        <span>Timer: <strong>{formatElapsed(elapsedSeconds)}</strong></span>
        <span>Moves: <strong>{moveHistory.length}</strong></span>
      </div>

      <div className="connect4-board-shell" role="group" aria-label="Connect 4 board">
        <div className="connect4-drop-row" role="toolbar" aria-label="Drop disc controls">
          {Array.from({ length: CONNECT4_COLS }).map((_, column) => (
            <button
              key={`drop-${column}`}
              className="connect4-drop-btn"
              type="button"
              onClick={() => playColumn(column)}
              disabled={gameOver || loadingAi || (isAiGame && !isPlayerTurn)}
              aria-label={`Drop in column ${column + 1}`}
            >
              Drop {column + 1}
            </button>
          ))}
        </div>

        <div className="connect4-grid">
          {Array.from({ length: CONNECT4_ROWS }).map((_, row) => (
            Array.from({ length: CONNECT4_COLS }).map((__, column) => {
              const cell = board[row][column];
              const isLast = lastMove?.row === row && lastMove?.column === column;
              const classes = [
                "connect4-cell",
                cell === "R" ? "is-red" : "",
                cell === "Y" ? "is-yellow" : "",
                isLast ? "is-last" : "",
              ].filter(Boolean).join(" ");

              return (
                <button
                  key={`cell-${row}-${column}`}
                  className={classes}
                  type="button"
                  onClick={() => playColumn(column)}
                  disabled={gameOver || loadingAi || (isAiGame && !isPlayerTurn)}
                  aria-label={`Row ${row + 1} Column ${column + 1}`}
                >
                  <span className="connect4-disc" />
                </button>
              );
            })
          ))}
        </div>
      </div>

      <div className="sudoku-actions">
        <button className="btn btn-start" onClick={startNewGame} disabled={loadingAi || saving}>
          New Game
        </button>
        <button className="btn btn-dark" onClick={onOpenHistory}>
          View Previous Games
        </button>
      </div>

      <div className="move-lines ttt-moves">
        {moveHistory.length === 0 ? (
          <div className="move-line">No moves yet.</div>
        ) : (
          moveHistory.map((move, idx) => (
            <div className="move-line" key={`${move}-${idx}`}>
              {idx + 1}. {move}
            </div>
          ))
        )}
      </div>

      <p className="hint-line">
        {status}
        {saving ? " Saving..." : ""}
      </p>
      {error && <div className="error-box">{error}</div>}

      {showResultModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="connect4-result-title">
            <h2 id="connect4-result-title">
              {winner === "draw" ? "Draw" : winner === playerDisc ? "You Won" : `${labelForDisc(winner as Connect4Disc)} Won`}
            </h2>
            <p>
              {winner === "draw"
                ? `Board filled in ${formatElapsed(elapsedSeconds)}.`
                : `${labelForDisc(winner as Connect4Disc)} connected 4 in ${moveHistory.length} moves and ${formatElapsed(elapsedSeconds)}.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={startNewGame}>
                Play Again
              </button>
              <button className="btn btn-dark" onClick={onOpenHistory}>
                View History
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
