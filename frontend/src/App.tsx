import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { CSSProperties } from "react";
import type { Square } from "chess.js";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { Chessboard } from "react-chessboard";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://chess-backend.agarwaladi.co.in";
const TOKEN_KEY = "chess_auth_token";
const USER_KEY = "chess_auth_user";

type PlayerColor = "white" | "black";
type DifficultyLevel = "easy" | "medium" | "hard";
type GameResult = "win" | "loss" | "draw" | "aborted";

type GameOverModalState = {
  visible: boolean;
  title: string;
  message: string;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
};

type SavedGame = {
  id: string;
  result: GameResult;
  difficulty: DifficultyLevel;
  player_color: PlayerColor;
  finished_at?: string;
};

const highlightBase: CSSProperties = {
  boxShadow: "inset 0 0 0 2px rgba(216, 143, 38, 0.9)",
};

const sourceSquareStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 3px rgba(173, 46, 36, 0.92)",
};

export default function App() {
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);

  const [game, setGame] = useState(new Chess());
  const [gameStarted, setGameStarted] = useState(false);
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bestMove, setBestMove] = useState("");
  const [status, setStatus] = useState("Choose a side to begin.");
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [hoverTargets, setHoverTargets] = useState<Square[]>([]);
  const [gameOverModal, setGameOverModal] = useState<GameOverModalState>({
    visible: false,
    title: "",
    message: "",
  });
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [gameSaved, setGameSaved] = useState(false);

  const fen = useMemo(() => game.fen(), [game]);
  const isSetup = !gameStarted;
  const playerTurn =
    !isSetup && ((game.turn() === "w" && playerColor === "white") || (game.turn() === "b" && playerColor === "black"));

  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};

    for (const target of hoverTargets) {
      styles[target] = highlightBase;
    }

    if (hoverSquare) {
      styles[hoverSquare] = sourceSquareStyle;
    }

    return styles;
  }, [hoverSquare, hoverTargets]);

  function clearHoverHints() {
    setHoverSquare(null);
    setHoverTargets([]);
  }

  function showGameOverModal(g: Chess) {
    if (g.isCheckmate()) {
      const winner = g.turn() === "w" ? "black" : "white";
      const youWon = winner === playerColor;
      setGameOverModal({
        visible: true,
        title: youWon ? "You Won!" : "You Lost",
        message: youWon
          ? "Great game. You checkmated the computer."
          : "Checkmate. The computer got you this time.",
      });
      return;
    }

    if (g.isDraw()) {
      setGameOverModal({
        visible: true,
        title: "Draw",
        message: "Game ended in a draw. Want a rematch?",
      });
      return;
    }

    setGameOverModal({
      visible: true,
      title: "Game Over",
      message: "The game has ended.",
    });
  }

  function gameOverMessage(g: Chess): string {
    if (g.isCheckmate()) {
      const winningSide = g.turn() === "w" ? "Black" : "White";
      return `Checkmate. ${winningSide} wins.`;
    }
    if (g.isDraw()) {
      return "Game drawn.";
    }
    return "Game over.";
  }

  function gameResultForPlayer(g: Chess): GameResult {
    if (g.isDraw()) return "draw";
    if (g.isCheckmate() && playerColor) {
      const winner = g.turn() === "w" ? "black" : "white";
      return winner === playerColor ? "win" : "loss";
    }
    return "aborted";
  }

  async function fetchGames(token: string) {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(API_BASE + "/games?limit=10", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data: { games?: SavedGame[]; detail?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch games");
      }
      setSavedGames(data.games ?? []);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Could not fetch games");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveGameIfNeeded(g: Chess) {
    if (!authToken || !difficulty || !playerColor || gameSaved) return;

    try {
      const res = await fetch(API_BASE + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          result: gameResultForPlayer(g),
          difficulty,
          player_color: playerColor,
          final_fen: g.fen(),
          move_history: moveHistory,
          pgn: g.pgn(),
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save game");
      }
      setGameSaved(true);
      void fetchGames(authToken);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save game");
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError("Google login failed. Missing credential.");
      return;
    }

    setAuthLoading(true);
    setError("");
    try {
      const res = await fetch(API_BASE + "/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: response.credential }),
      });

      const data: {
        access_token?: string;
        user?: AuthUser;
        detail?: string;
      } = await res.json();

      if (!res.ok || !data.access_token || !data.user) {
        throw new Error(data.detail || "Could not sign in");
      }

      setAuthToken(data.access_token);
      setUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      void fetchGames(data.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    googleLogout();
    setAuthToken("");
    setUser(null);
    setSavedGames([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function requestEngineMove(currentFen: string) {
    if (!difficulty) {
      setError("Difficulty is not selected.");
      return;
    }

    setLoading(true);
    setError("");
    setBestMove("");
    setStatus("Computer is thinking...");
    clearHoverHints();

    try {
      const res = await fetch(API_BASE + "/best-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: currentFen,
          difficulty,
        }),
      });

      const data: { best_move?: string; detail?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Request failed");
      }

      if (!data.best_move) {
        throw new Error("Missing best_move in response");
      }

      const move = data.best_move;
      const next = new Chess(currentFen);
      const applied = next.move({
        from: move.slice(0, 2) as Square,
        to: move.slice(2, 4) as Square,
        promotion: move.length > 4 ? move[4] : "q",
      });

      if (!applied) {
        throw new Error(`Engine returned an invalid move: ${move}`);
      }

      setMoveHistory((prev) => [...prev, applied.san]);
      setBestMove(move);
      setGame(next);

      if (next.isGameOver()) {
        setStatus(gameOverMessage(next));
        showGameOverModal(next);
        void saveGameIfNeeded(next);
      } else {
        setStatus("Your turn.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch best move");
      setStatus("Computer move failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function startGame() {
    if (!playerColor || !difficulty) {
      setError("Please choose both color and difficulty.");
      return;
    }

    const fresh = new Chess();
    setGameStarted(true);
    setGame(fresh);
    setStartedAt(new Date().toISOString());
    setMoveHistory([]);
    setGameSaved(false);
    setError("");
    setBestMove("");
    clearHoverHints();
    setGameOverModal({ visible: false, title: "", message: "" });

    if (playerColor === "white") {
      setStatus("Your turn.");
      return;
    }

    setStatus("Computer plays first as White.");
    void requestEngineMove(fresh.fen());
  }

  function handleSquareHover(square: string) {
    if (isSetup || loading || !playerTurn || game.isGameOver()) {
      clearHoverHints();
      return;
    }

    const castSquare = square as Square;
    const piece = game.get(castSquare);
    if (!piece) {
      clearHoverHints();
      return;
    }

    const playerCode = playerColor === "white" ? "w" : "b";
    if (piece.color !== playerCode) {
      clearHoverHints();
      return;
    }

    const moves = game.moves({ square: castSquare, verbose: true });
    if (!moves.length) {
      clearHoverHints();
      return;
    }

    setHoverSquare(castSquare);
    setHoverTargets(moves.map((m) => m.to as Square));
  }

  function onDrop(sourceSquare: Square, targetSquare: Square): boolean {
    if (isSetup || loading || game.isGameOver() || !playerTurn) {
      return false;
    }

    const piece = game.get(sourceSquare);
    if (!piece) return false;

    const playerCode = playerColor === "white" ? "w" : "b";
    if (piece.color !== playerCode) return false;

    const next = new Chess(game.fen());
    const move = next.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!move) return false;

    setMoveHistory((prev) => [...prev, move.san]);
    setGame(next);
    setError("");
    setBestMove("");
    clearHoverHints();

    if (next.isGameOver()) {
      setStatus(gameOverMessage(next));
      showGameOverModal(next);
      void saveGameIfNeeded(next);
      return true;
    }

    setStatus("Computer is thinking...");
    void requestEngineMove(next.fen());
    return true;
  }

  function resetBoard() {
    setGameStarted(false);
    setPlayerColor(null);
    setDifficulty(null);
    setGame(new Chess());
    setLoading(false);
    setError("");
    setBestMove("");
    setMoveHistory([]);
    setStartedAt(null);
    setGameSaved(false);
    setStatus("Choose a side to begin.");
    clearHoverHints();
    setGameOverModal({ visible: false, title: "", message: "" });
  }

  useEffect(() => {
    if (!authToken) return;
    if (savedGames.length > 0) return;
    if (historyLoading) return;
    void fetchGames(authToken);
  }, [authToken, savedGames.length, historyLoading]);

  return (
    <div className="app-shell">
      <div className="grain" aria-hidden="true" />

      <main className="board-page">
        <header className="topbar">
          <h1>Play vs Computer</h1>
          <p>Choose your side, then challenge Stockfish in real time.</p>
          <div style={{ marginTop: "10px" }}>
            {user ? (
              <div>
                <strong>Signed in as {user.name}</strong>
                <div style={{ marginTop: "8px" }}>
                  <button className="btn btn-light" onClick={handleLogout}>Sign Out</button>
                </div>
              </div>
            ) : (
              <div>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google sign-in failed")}
                />
                {authLoading && <p>Signing in...</p>}
              </div>
            )}
          </div>
        </header>

        {isSetup ? (
          <section className="setup-card">
            <h2>Select Side And Difficulty</h2>
            <p>Pick your color and challenge level before starting.</p>

            <h3 className="setup-subtitle">Your Side</h3>
            <div className="setup-actions">
              <button
                className={`btn btn-light ${playerColor === "white" ? "is-selected" : ""}`}
                onClick={() => setPlayerColor("white")}
              >
                Play as White
              </button>
              <button
                className={`btn btn-dark ${playerColor === "black" ? "is-selected" : ""}`}
                onClick={() => setPlayerColor("black")}
              >
                Play as Black
              </button>
            </div>
            <div className="selection-hint">
              {playerColor ? `Selected: ${playerColor === "white" ? "White" : "Black"}` : "Select White or Black"}
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
              {difficulty
                ? `Difficulty: ${difficulty[0].toUpperCase() + difficulty.slice(1)}`
                : "Select Easy, Medium, or Hard"}
            </div>

            <button className="btn btn-start" onClick={startGame} disabled={!playerColor || !difficulty}>
              Start Game
            </button>
          </section>
        ) : (
          <section className="game-grid">
            <div className="board-wrap">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: playerColor ?? undefined,
                  squareStyles,
                  onMouseOverSquare: ({ square }) => handleSquareHover(square),
                  onMouseOutSquare: () => clearHoverHints(),
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare) return false;
                    return onDrop(sourceSquare as Square, targetSquare as Square);
                  },
                }}
              />
            </div>

            <aside className="panel">
              <h2>Match Console</h2>
              <div className="row">
                <span>You:</span>
                <strong>{playerColor === "white" ? "White" : "Black"}</strong>
              </div>
              <div className="row">
                <span>Difficulty:</span>
                <strong>{difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) : "-"}</strong>
              </div>
              <div className="row">
                <span>Turn:</span>
                <strong>{game.turn() === "w" ? "White" : "Black"}</strong>
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
              {historyError && <div className="error-box">{historyError}</div>}

              {user && (
                <div className="fen-block">
                  <span>Recent Games</span>
                  {historyLoading ? (
                    <p>Loading history...</p>
                  ) : savedGames.length === 0 ? (
                    <p>No saved games yet.</p>
                  ) : (
                    <ul>
                      {savedGames.map((g) => (
                        <li key={g.id}>
                          {g.result.toUpperCase()} | {g.difficulty} | {g.player_color} | {g.finished_at ?? "-"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button className="btn btn-reset" onClick={resetBoard}>
                New Game
              </button>
            </aside>
          </section>
        )}

        <footer className="hint-line">
          {isSetup
            ? "Tip: choose Black if you want Stockfish to make the first move."
            : playerTurn
              ? "Your move: hover a piece to preview legal squares, then drag to play."
              : "Wait for computer reply. Dragging is disabled on computer turn."}
        </footer>
      </main>

      {gameOverModal.visible && (
        <div className="modal-backdrop" role="presentation">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <h2 id="result-title">{gameOverModal.title}</h2>
            <p>{gameOverModal.message}</p>
            <div className="modal-actions">
              <button className="btn btn-reset" onClick={resetBoard}>
                New Game
              </button>
              <button
                className="btn btn-light"
                onClick={() => setGameOverModal((prev) => ({ ...prev, visible: false }))}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="corner-orb" aria-hidden="true" />
      <div className="corner-orb orb-two" aria-hidden="true" />
    </div>
  );
}
