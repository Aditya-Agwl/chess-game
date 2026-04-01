import { useEffect, useMemo, useState } from "react";
import type { DifficultyLevel, GameResult } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
};

type Cell = "" | "X" | "O";
type Mark = "X" | "O";
const DIFFICULTY_OPTIONS: DifficultyLevel[] = ["easy", "medium", "hard"];

function toBoardString(board: Cell[]): string {
  return board.map((cell) => (cell === "" ? "-" : cell)).join("");
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function winnerFor(board: Cell[]): "X" | "O" | "draw" | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] !== "" && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }

  if (board.every((cell) => cell !== "")) {
    return "draw";
  }

  return null;
}

export default function TicTacToePage({ authToken, apiBase, onOpenHistory }: Props) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [playerMark, setPlayerMark] = useState<Mark>("X");
  const [board, setBoard] = useState<Cell[]>(new Array(9).fill(""));
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadingMove, setLoadingMove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Your move. You are X.");
  const [error, setError] = useState("");
  const [winner, setWinner] = useState<"X" | "O" | "draw" | null>(null);
  const [saved, setSaved] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());
  const [lastAiMoveIndex, setLastAiMoveIndex] = useState<number | null>(null);

  const gameOver = winner !== null;
  const boardString = useMemo(() => toBoardString(board), [board]);
  const aiMark: Mark = playerMark === "X" ? "O" : "X";
  const playerTurn = moveHistory.length % 2 === (playerMark === "X" ? 0 : 1);
  const turnLabel = gameOver ? "Finished" : loadingMove ? "AI" : playerTurn ? "You" : "AI";

  function resultForWinner(nextWinner: "X" | "O" | "draw"): GameResult {
    if (nextWinner === "draw") return "draw";
    return nextWinner === playerMark ? "win" : "loss";
  }

  async function saveTicTacToeIfNeeded(forcedResult?: GameResult, forcedWinner?: "X" | "O" | "draw") {
    if (!authToken || saved) return;

    setSaving(true);
    try {
      const resolvedWinner = forcedWinner ?? winner;
      const result = forcedResult ?? (resolvedWinner ? resultForWinner(resolvedWinner) : "aborted");

      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "tictactoe",
          result,
          difficulty,
          tictactoe_board: boardString,
          tictactoe_player_mark: playerMark,
          tictactoe_winner: resolvedWinner ?? undefined,
          tictactoe_move_history: moveHistory,
          tictactoe_elapsed_seconds: elapsedSeconds,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save Tic Tac Toe game");
      }

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Tic Tac Toe game");
    } finally {
      setSaving(false);
    }
  }

  function startNewGame() {
    setBoard(new Array(9).fill(""));
    setMoveHistory([]);
    setElapsedSeconds(0);
    setLoadingMove(false);
    setSaving(false);
    setStatus(playerMark === "X" ? "Your move. You are X." : "Computer is thinking...");
    setError("");
    setWinner(null);
    setSaved(false);
    setShowResultModal(false);
    setStartedAt(new Date().toISOString());
    setLastAiMoveIndex(null);

    if (playerMark === "O") {
      window.setTimeout(() => {
        void requestAiMove(new Array(9).fill(""), []);
      }, 0);
    }
  }

  async function endTicTacToe() {
    if (gameOver) return;
    await saveTicTacToeIfNeeded("aborted");
    setStatus("Game ended and saved.");
  }

  async function requestAiMove(nextBoard: Cell[], history: string[]) {
    setLoadingMove(true);
    setError("");
    try {
      const res = await fetch(apiBase + "/tictactoe/best-move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board: toBoardString(nextBoard),
          difficulty,
          ai_mark: aiMark,
        }),
      });

      const data: { index?: number; detail?: string } = await res.json();
      if (!res.ok || data.index === undefined) {
        throw new Error(data.detail || "Could not fetch AI move");
      }

      const index = data.index;
      if (index < 0 || index > 8 || nextBoard[index] !== "") {
        throw new Error("AI returned invalid move");
      }

      const afterAi = [...nextBoard];
      afterAi[index] = aiMark;
      const aiRow = Math.floor(index / 3) + 1;
      const aiCol = (index % 3) + 1;
      const updatedHistory = [...history, `${aiMark} -> R${aiRow}C${aiCol}`];
      const nextWinner = winnerFor(afterAi);

      setBoard(afterAi);
      setMoveHistory(updatedHistory);
      setLastAiMoveIndex(index);

      if (nextWinner) {
        setWinner(nextWinner);
        setShowResultModal(true);
        setStatus(nextWinner === "draw" ? "Draw game." : `${nextWinner} wins.`);
        void saveTicTacToeIfNeeded(undefined, nextWinner);
      } else {
        setStatus(`Your move. You are ${playerMark}.`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch AI move");
      setStatus("AI move failed. Try another move.");
    } finally {
      setLoadingMove(false);
    }
  }

  function playAt(index: number) {
    if (loadingMove || gameOver || board[index] !== "" || !playerTurn) return;

    const next = [...board];
    next[index] = playerMark;
    setLastAiMoveIndex(null);

    const row = Math.floor(index / 3) + 1;
    const col = (index % 3) + 1;
    const history = [...moveHistory, `${playerMark} -> R${row}C${col}`];

    const nextWinner = winnerFor(next);
    setBoard(next);
    setMoveHistory(history);

    if (nextWinner) {
      setWinner(nextWinner);
      setShowResultModal(true);
      setStatus(nextWinner === "draw" ? "Draw game." : `${nextWinner} wins.`);
      void saveTicTacToeIfNeeded(undefined, nextWinner);
      return;
    }

    setStatus("Computer is thinking...");
    void requestAiMove(next, history);
  }

  function switchPlayerMark(mark: Mark) {
    if (mark === playerMark) return;
    setPlayerMark(mark);
    setBoard(new Array(9).fill(""));
    setMoveHistory([]);
    setElapsedSeconds(0);
    setLoadingMove(false);
    setSaving(false);
    setError("");
    setWinner(null);
    setSaved(false);
    setShowResultModal(false);
    setStartedAt(new Date().toISOString());
    setLastAiMoveIndex(null);

    if (mark === "O") {
      setStatus("Computer is thinking...");
      window.setTimeout(() => {
        void requestAiMove(new Array(9).fill(""), []);
      }, 0);
    } else {
      setStatus("Your move. You are X.");
    }
  }

  useEffect(() => {
    if (gameOver) return;
    const id = window.setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [gameOver]);

  return (
    <section className="tictactoe-page setup-card">
      <div className="sudoku-header">
        <h2>Tic Tac Toe Arena</h2>
        <p>Play as X against the computer. Same account history and timer tracking.</p>
      </div>

      <div className="sudoku-topbar">
        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)} disabled={loadingMove || saving}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
            ))}
          </select>
        </label>
        <div className="ttt-side-actions">
          <button className={`btn btn-light ${playerMark === "X" ? "is-selected" : ""}`} onClick={() => switchPlayerMark("X")} disabled={loadingMove || saving}>Play as X</button>
          <button className={`btn btn-dark ${playerMark === "O" ? "is-selected" : ""}`} onClick={() => switchPlayerMark("O")} disabled={loadingMove || saving}>Play as O</button>
        </div>
        <div className="sudoku-stats">
          <span>You: <strong>{playerMark}</strong></span>
          <span>AI: <strong>{aiMark}</strong></span>
          <span>Turn: <strong>{turnLabel}</strong></span>
          <span>Timer: <strong>{formatElapsed(elapsedSeconds)}</strong></span>
          <span>Moves: <strong>{moveHistory.length}</strong></span>
          <span>Status: <strong>{gameOver ? "Finished" : "In Progress"}</strong></span>
        </div>
      </div>

      <div className="ttt-grid" role="grid" aria-label="Tic Tac Toe board">
        {board.map((cell, idx) => (
          <button
            key={idx}
            className={`ttt-cell ${lastAiMoveIndex === idx ? "is-ai-last" : ""}`}
            type="button"
            onClick={() => playAt(idx)}
            disabled={loadingMove || saving || gameOver || cell !== ""}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="sudoku-actions">
        <button className="btn btn-start" onClick={startNewGame} disabled={loadingMove || saving}>New Game</button>
        <button className="btn btn-reset" onClick={() => void endTicTacToe()} disabled={loadingMove || saving || gameOver}>End Game</button>
        <button className="btn btn-dark" onClick={onOpenHistory}>View Previous Games</button>
      </div>

      <div className="move-lines ttt-moves">
        {moveHistory.length === 0 ? (
          <div className="move-line">No moves yet.</div>
        ) : (
          moveHistory.map((move, idx) => (
            <div className="move-line" key={`${move}-${idx}`}>{idx + 1}. {move}</div>
          ))
        )}
      </div>

      <p className="hint-line">{status}{saving ? " Saving..." : ""}</p>
      {error && <div className="error-box">{error}</div>}

      {showResultModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="ttt-result-title">
            <h2 id="ttt-result-title">{winner === "draw" ? "Draw" : winner === playerMark ? "You Won" : "You Lost"}</h2>
            <p>
              {winner === "draw"
                ? `Board filled in ${formatElapsed(elapsedSeconds)}.`
                : `${winner} won in ${moveHistory.length} moves and ${formatElapsed(elapsedSeconds)}.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={startNewGame}>Play Again</button>
              <button className="btn btn-dark" onClick={onOpenHistory}>View History</button>
              <button className="btn btn-light" onClick={() => setShowResultModal(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
