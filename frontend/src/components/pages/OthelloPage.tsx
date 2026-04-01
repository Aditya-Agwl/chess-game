import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DifficultyLevel, GameResult } from "../../types";
import {
  OTHELLO_SIZE,
  applyMove,
  boardToString,
  countDiscs,
  createOthelloBoard,
  getValidMoves,
  opponentDisc,
  type OthelloCell,
  type OthelloDisc,
  type OthelloWinner,
} from "../../utils/othello";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
  routeMode: "settings" | "play";
};

type GameMode = "setup" | "local" | "ai";

function labelForDisc(disc: OthelloDisc): string {
  return disc === "B" ? "Black" : "White";
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function winnerFromCounts(board: OthelloCell[][]): OthelloWinner {
  const counts = countDiscs(board);
  if (counts.B === counts.W) return "draw";
  return counts.B > counts.W ? "B" : "W";
}

type OthelloRouteState = {
  gameMode: "local" | "ai";
  difficulty: DifficultyLevel;
  playerDisc: OthelloDisc;
};

export default function OthelloPage({ authToken, apiBase, onOpenHistory, routeMode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [gameMode, setGameMode] = useState<GameMode>("setup");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [playerDisc, setPlayerDisc] = useState<OthelloDisc>("B");
  const [gameStarted, setGameStarted] = useState(false);

  const [board, setBoard] = useState(createOthelloBoard);
  const [currentPlayer, setCurrentPlayer] = useState<OthelloDisc>("B");
  const [winner, setWinner] = useState<OthelloWinner>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastMove, setLastMove] = useState<{ row: number; col: number } | null>(null);

  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());

  const isAiGame = gameMode === "ai";
  const aiDisc: OthelloDisc = playerDisc === "B" ? "W" : "B";
  const gameOver = winner !== null;
  const validMoves = useMemo(() => getValidMoves(board, currentPlayer), [board, currentPlayer]);
  const isPlayerTurn = !isAiGame || currentPlayer === playerDisc;

  const counts = useMemo(() => countDiscs(board), [board]);

  const status = useMemo(() => {
    if (winner === "draw") return "Draw game.";
    if (winner === "B" || winner === "W") return `${labelForDisc(winner)} wins.`;
    if (loadingAi) return "AI is thinking...";
    if (validMoves.length === 0) return `${labelForDisc(currentPlayer)} has no legal move.`;
    return `${labelForDisc(currentPlayer)} to play.`;
  }, [winner, loadingAi, validMoves.length, currentPlayer]);

  const params = new URLSearchParams(location.search);
  const settingsMode: "local" | "ai" = params.get("mode") === "local" ? "local" : "ai";
  const settingsDifficulty: DifficultyLevel = params.get("difficulty") === "easy"
    ? "easy"
    : params.get("difficulty") === "hard"
      ? "hard"
      : "medium";
  const settingsDisc: OthelloDisc = params.get("disc") === "W" ? "W" : "B";

  function openSettingsGame(nextMode: "local" | "ai", nextDifficulty = settingsDifficulty, nextDisc = settingsDisc) {
    navigate(`/othello/settings/game?mode=${nextMode}&difficulty=${nextDifficulty}&disc=${nextDisc}`);
  }

  function rowLabel(row: number, col: number): string {
    return `${String.fromCharCode(65 + col)}${row + 1}`;
  }

  function resultFromWinner(nextWinner: OthelloWinner): GameResult {
    if (nextWinner === "draw") return "draw";
    return nextWinner === playerDisc ? "win" : "loss";
  }

  async function saveOthelloIfNeeded(forcedWinner?: OthelloWinner) {
    if (!authToken || saved) return;

    setSaving(true);
    try {
      const resolvedWinner = forcedWinner ?? winner;
      const result = resolvedWinner ? resultFromWinner(resolvedWinner) : "aborted";

      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "othello",
          result,
          difficulty,
          othello_board: boardToString(board),
          othello_player_disc: playerDisc,
          othello_winner: resolvedWinner ?? undefined,
          othello_move_history: moveHistory,
          othello_elapsed_seconds: elapsedSeconds,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save Othello game");
      }

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Othello game");
    } finally {
      setSaving(false);
    }
  }

  function endByNoMoves(finalBoard: OthelloCell[][], history: string[]) {
    const finalWinner = winnerFromCounts(finalBoard);
    setBoard(finalBoard);
    setMoveHistory(history);
    setWinner(finalWinner);
    setShowResultModal(true);
    void saveOthelloIfNeeded(finalWinner);
  }

  function advanceTurn(nextBoard: OthelloCell[][], history: string[], justPlayed: OthelloDisc) {
    const nextPlayer = opponentDisc(justPlayed);
    const nextMoves = getValidMoves(nextBoard, nextPlayer);

    if (nextMoves.length > 0) {
      setBoard(nextBoard);
      setMoveHistory(history);
      setCurrentPlayer(nextPlayer);
      if (isAiGame && nextPlayer === aiDisc) {
        void requestAiMove(nextBoard, history, aiDisc);
      }
      return;
    }

    const fallbackMoves = getValidMoves(nextBoard, justPlayed);
    if (fallbackMoves.length === 0) {
      endByNoMoves(nextBoard, history);
      return;
    }

    const passHistory = [...history, `${labelForDisc(nextPlayer)} pass`];
    setBoard(nextBoard);
    setMoveHistory(passHistory);
    setCurrentPlayer(justPlayed);

    if (isAiGame && justPlayed === aiDisc) {
      void requestAiMove(nextBoard, passHistory, aiDisc);
    }
  }

  function launchGame(nextMode: "local" | "ai", nextDifficulty: DifficultyLevel, nextPlayerDisc: OthelloDisc) {
    const fresh = createOthelloBoard();
    setGameMode(nextMode);
    setDifficulty(nextDifficulty);
    setPlayerDisc(nextPlayerDisc);
    setBoard(fresh);
    setCurrentPlayer("B");
    setWinner(null);
    setMoveHistory([]);
    setElapsedSeconds(0);
    setLastMove(null);
    setLoadingAi(false);
    setSaving(false);
    setSaved(false);
    setError("");
    setShowResultModal(false);
    setStartedAt(new Date().toISOString());
    setGameStarted(true);

    const nextAiDisc: OthelloDisc = nextPlayerDisc === "B" ? "W" : "B";
    if (nextMode === "ai" && nextAiDisc === "B") {
      window.setTimeout(() => {
        void requestAiMove(fresh, [], "B");
      }, 0);
    }
  }

  async function requestAiMove(nextBoard: OthelloCell[][], history: string[], aiTurn: OthelloDisc) {
    setLoadingAi(true);
    setError("");
    try {
      const res = await fetch(apiBase + "/othello/best-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: boardToString(nextBoard),
          difficulty,
          ai_disc: aiTurn,
        }),
      });

      const data: { row?: number; col?: number; pass?: boolean; detail?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch Othello AI move");
      }

      if (data.pass) {
        const playerMoves = getValidMoves(nextBoard, playerDisc);
        if (playerMoves.length === 0) {
          endByNoMoves(nextBoard, [...history, `${labelForDisc(aiTurn)} pass`]);
        } else {
          setBoard(nextBoard);
          setMoveHistory([...history, `${labelForDisc(aiTurn)} pass`]);
          setCurrentPlayer(playerDisc);
        }
        return;
      }

      if (data.row === undefined || data.col === undefined) {
        throw new Error("AI returned invalid move data");
      }

      const applied = applyMove(nextBoard, data.row, data.col, aiTurn);
      if (!applied) {
        throw new Error("AI returned illegal move");
      }

      setLastMove({ row: data.row, col: data.col });
      const updatedHistory = [...history, `${labelForDisc(aiTurn)} -> ${rowLabel(data.row, data.col)}`];
      advanceTurn(applied, updatedHistory, aiTurn);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch Othello AI move");
    } finally {
      setLoadingAi(false);
    }
  }

  function playAt(row: number, col: number) {
    if (gameOver || loadingAi || !isPlayerTurn) return;

    const applied = applyMove(board, row, col, currentPlayer);
    if (!applied) return;

    setLastMove({ row, col });
    const updatedHistory = [...moveHistory, `${labelForDisc(currentPlayer)} -> ${rowLabel(row, col)}`];
    advanceTurn(applied, updatedHistory, currentPlayer);
  }

  function handlePass() {
    if (validMoves.length > 0 || gameOver || loadingAi) return;

    const nextPlayer = opponentDisc(currentPlayer);
    const nextMoves = getValidMoves(board, nextPlayer);
    const history = [...moveHistory, `${labelForDisc(currentPlayer)} pass`];

    if (nextMoves.length === 0) {
      endByNoMoves(board, history);
      return;
    }

    setMoveHistory(history);
    setCurrentPlayer(nextPlayer);

    if (isAiGame && nextPlayer === aiDisc) {
      void requestAiMove(board, history, aiDisc);
    }
  }

  function startNewGame() {
    launchGame(isAiGame ? "ai" : "local", difficulty, playerDisc);
  }

  function endGame() {
    if (gameOver) return;
    void saveOthelloIfNeeded();
    setWinner(winnerFromCounts(board));
    setShowResultModal(true);
  }

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const id = window.setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [gameStarted, gameOver]);

  useEffect(() => {
    if (routeMode !== "play") {
      return;
    }

    const state = (location.state as OthelloRouteState | null) ?? null;
    if (!state) {
      setError("Open Othello settings first, then start a game.");
      setGameStarted(false);
      return;
    }

    launchGame(state.gameMode, state.difficulty, state.playerDisc);
  }, [routeMode, location.state]);

  useEffect(() => {
    if (!gameStarted || gameOver || !isAiGame || loadingAi) return;

    const currentMoves = getValidMoves(board, currentPlayer);
    if (currentMoves.length > 0) return;

    const nextPlayer = opponentDisc(currentPlayer);
    const nextMoves = getValidMoves(board, nextPlayer);

    if (nextMoves.length === 0) {
      endByNoMoves(board, [...moveHistory, `${labelForDisc(currentPlayer)} pass`]);
      return;
    }

    const history = [...moveHistory, `${labelForDisc(currentPlayer)} pass`];
    setMoveHistory(history);
    setCurrentPlayer(nextPlayer);

    if (nextPlayer === aiDisc) {
      void requestAiMove(board, history, aiDisc);
    }
  }, [gameStarted, gameOver, isAiGame, loadingAi, board, currentPlayer, aiDisc, moveHistory]);

  if (routeMode === "settings") {
    const isModeStep = location.pathname === "/othello/settings/mode";

    if (isModeStep) {
      return (
        <section className="setup-card othello-settings-card">
          <div className="othello-settings-head">
            <h2>Othello Arena</h2>
            <span className="othello-step-pill">Step 1 of 2</span>
          </div>
          <p>Pick how you want to play.</p>

          <div className="othello-mode-grid" role="group" aria-label="Othello mode selection">
            <button
              className="othello-mode-card"
              onClick={() => openSettingsGame("local")}
            >
              <strong>Local 2-Player</strong>
              <span>Classic over-the-board style with two human players.</span>
            </button>
            <button className="othello-mode-card is-ai" onClick={() => openSettingsGame("ai")}>
              <strong>Play vs AI</strong>
              <span>Train against computer with adjustable difficulty.</span>
            </button>
          </div>

          <div className="othello-settings-footer">
            <button className="btn btn-light" onClick={() => navigate("/")}>Back to Home</button>
          </div>
        </section>
      );
    }

    return (
      <section className="setup-card othello-settings-card">
        <div className="othello-settings-head">
          <h2>Othello Settings</h2>
          <span className="othello-step-pill">Step 2 of 2</span>
        </div>
        <p>Fine-tune your match and start.</p>

        <div className="sudoku-stats othello-settings-meta">
          <span>Selected Mode: <strong>{settingsMode === "ai" ? "vs AI" : "Local"}</strong></span>
        </div>

        <div className="othello-settings-panel">
          {settingsMode === "ai" ? (
            <>
            <h3 className="setup-subtitle">Your Disc</h3>
            <div className="setup-actions">
              <button
                className={`btn btn-light ${settingsDisc === "B" ? "is-selected" : ""}`}
                onClick={() => openSettingsGame("ai", settingsDifficulty, "B")}
              >
                Black
              </button>
              <button
                className={`btn btn-dark ${settingsDisc === "W" ? "is-selected" : ""}`}
                onClick={() => openSettingsGame("ai", settingsDifficulty, "W")}
              >
                White
              </button>
            </div>

            <h3 className="setup-subtitle">Difficulty</h3>
            <div className="difficulty-actions">
              <button
                className={`btn btn-difficulty ${settingsDifficulty === "easy" ? "is-selected" : ""}`}
                onClick={() => openSettingsGame("ai", "easy", settingsDisc)}
              >
                Easy
              </button>
              <button
                className={`btn btn-difficulty ${settingsDifficulty === "medium" ? "is-selected" : ""}`}
                onClick={() => openSettingsGame("ai", "medium", settingsDisc)}
              >
                Medium
              </button>
              <button
                className={`btn btn-difficulty ${settingsDifficulty === "hard" ? "is-selected" : ""}`}
                onClick={() => openSettingsGame("ai", "hard", settingsDisc)}
              >
                Hard
              </button>
            </div>
            </>
          ) : (
            <p className="selection-hint">Local mode selected. No AI settings needed.</p>
          )}
        </div>

        <div className="sudoku-actions othello-settings-actions">
          <button className="btn btn-light" onClick={() => navigate("/othello/settings/mode")}>Back</button>
          <button
            className="btn btn-start"
            onClick={() => {
              navigate("/othello/play", {
                state: {
                  gameMode: settingsMode,
                  difficulty: settingsDifficulty,
                  playerDisc: settingsDisc,
                } satisfies OthelloRouteState,
              });
            }}
          >
            Start Game
          </button>
        </div>
      </section>
    );
  }

  if (!gameStarted) {
    return (
      <section className="setup-card">
        <h2>Othello Play</h2>
        <p>Start from settings to launch a new game session.</p>
        <div className="sudoku-actions">
          <button className="btn btn-start" onClick={() => navigate("/othello/settings/mode")}>Open Settings</button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </section>
    );
  }

  return (
    <section className="othello-page setup-card">
      <div className="sudoku-header">
        <h2>Othello Arena</h2>
        <p>{isAiGame ? `Playing vs AI (${difficulty})` : "Local 2-player mode"}. Control corners and mobility.</p>
      </div>

      <div className="sudoku-stats">
        <span>Mode: <strong>{isAiGame ? "vs AI" : "Local"}</strong></span>
        <span>Turn: <strong>{gameOver ? "-" : labelForDisc(currentPlayer)}</strong></span>
        <span>Black: <strong>{counts.B}</strong></span>
        <span>White: <strong>{counts.W}</strong></span>
        <span>Moves: <strong>{moveHistory.length}</strong></span>
        <span>Timer: <strong>{formatElapsed(elapsedSeconds)}</strong></span>
      </div>

      <div className="othello-board" role="grid" aria-label="Othello board">
        {Array.from({ length: OTHELLO_SIZE }).map((_, row) => (
          Array.from({ length: OTHELLO_SIZE }).map((__, col) => {
            const cell = board[row][col];
            const isValid = validMoves.some(([r, c]) => r === row && c === col);
            const isLast = lastMove?.row === row && lastMove?.col === col;

            return (
              <button
                key={`${row}-${col}`}
                type="button"
                className={`othello-cell ${cell === "B" ? "is-black" : ""} ${cell === "W" ? "is-white" : ""} ${isValid && isPlayerTurn ? "is-valid" : ""} ${isLast ? "is-last" : ""}`}
                onClick={() => playAt(row, col)}
                disabled={gameOver || loadingAi || !isPlayerTurn || !isValid}
              >
                <span className="othello-disc" />
              </button>
            );
          })
        ))}
      </div>

      <div className="sudoku-actions">
        <button className="btn btn-start" onClick={startNewGame} disabled={saving || loadingAi}>New Game</button>
        <button className="btn btn-light" onClick={() => navigate("/othello/settings/mode")}>Back to Settings</button>
        <button className="btn btn-light" onClick={handlePass} disabled={saving || loadingAi || gameOver || validMoves.length > 0}>Pass Turn</button>
        <button className="btn btn-reset" onClick={endGame} disabled={saving || loadingAi || gameOver}>End Game</button>
        <button className="btn btn-dark" onClick={onOpenHistory}>View Previous Games</button>
      </div>

      <div className="move-lines ttt-moves">
        {moveHistory.length === 0
          ? <div className="move-line">No moves yet.</div>
          : moveHistory.map((move, idx) => <div className="move-line" key={`${move}-${idx}`}>{idx + 1}. {move}</div>)}
      </div>

      <p className="hint-line">{status}{saving ? " Saving..." : ""}</p>
      {error && <div className="error-box">{error}</div>}

      {showResultModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="othello-result-title">
            <h2 id="othello-result-title">{winner === "draw" ? "Draw" : winner === playerDisc ? "You Won" : "You Lost"}</h2>
            <p>
              {winner === "draw"
                ? `Final score ${counts.B}-${counts.W} in ${formatElapsed(elapsedSeconds)}.`
                : `${labelForDisc(winner as OthelloDisc)} wins ${counts.B}-${counts.W} in ${formatElapsed(elapsedSeconds)}.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={startNewGame}>Play Again</button>
              <button className="btn btn-dark" onClick={onOpenHistory}>View History</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
