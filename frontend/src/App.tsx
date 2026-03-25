import { useMemo, useState } from "react";
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

type PageView = "play" | "history";
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
  move_history: string[];
  final_fen: string;
  pgn?: string;
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
  const [currentPage, setCurrentPage] = useState<PageView>("play");
  const [authLoading, setAuthLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [recentGames, setRecentGames] = useState<SavedGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [filterResult, setFilterResult] = useState<"all" | GameResult>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<"all" | DifficultyLevel>("all");
  const [filterColor, setFilterColor] = useState<"all" | PlayerColor>("all");
  const [searchText, setSearchText] = useState("");

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

  async function fetchRecentGames() {
    if (!authToken) return;
    setGamesLoading(true);
    setGamesError("");
    try {
      const res = await fetch(API_BASE + "/games?limit=100", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data: { games?: SavedGame[]; detail?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch recent games");
      }

      const list = data.games ?? [];
      setRecentGames(list);
      setSelectedGameId((prev) => prev || (list[0]?.id ?? ""));
    } catch (e: unknown) {
      setGamesError(e instanceof Error ? e.message : "Could not fetch recent games");
    } finally {
      setGamesLoading(false);
    }
  }

  function openRecentGamesPage() {
    setShowUserMenu(false);
    setCurrentPage("history");
    void fetchRecentGames();
  }

  function resultLabel(result: GameResult): string {
    if (result === "win") return "Win";
    if (result === "loss") return "Loss";
    if (result === "draw") return "Draw";
    return "Aborted";
  }

  function formatDate(value?: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  }

  function movePairs(moves: string[]): string[] {
    const lines: string[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = moves[i] ?? "";
      const blackMove = moves[i + 1] ?? "";
      lines.push(`${moveNumber}. ${whiteMove}${blackMove ? ` ${blackMove}` : ""}`.trim());
    }
    return lines;
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
    setShowUserMenu(false);
    setCurrentPage("play");
    setRecentGames([]);
    setSelectedGameId("");
    setGamesError("");
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

  const filteredGames = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return recentGames.filter((g) => {
      if (filterResult !== "all" && g.result !== filterResult) return false;
      if (filterDifficulty !== "all" && g.difficulty !== filterDifficulty) return false;
      if (filterColor !== "all" && g.player_color !== filterColor) return false;
      if (!query) return true;

      const dateText = formatDate(g.finished_at).toLowerCase();
      const pgnText = (g.pgn ?? "").toLowerCase();
      return (
        dateText.includes(query)
        || pgnText.includes(query)
        || g.result.includes(query)
        || g.difficulty.includes(query)
        || g.player_color.includes(query)
      );
    });
  }, [recentGames, filterResult, filterDifficulty, filterColor, searchText]);

  const selectedGame = useMemo(
    () => filteredGames.find((g) => g.id === selectedGameId) ?? filteredGames[0] ?? null,
    [filteredGames, selectedGameId],
  );

  return (
    <div className="app-shell">
      <div className="grain" aria-hidden="true" />

      <main className="board-page">
        <header className="topbar">
          <div>
            <h1>Play vs Computer</h1>
            <p>Choose your side, then challenge Stockfish in real time.</p>
          </div>
          <div className="auth-controls">
            {user ? (
              <div className="user-chip-wrap">
                <button
                  className="user-chip"
                  title={user.name}
                  onClick={() => setShowUserMenu((prev) => !prev)}
                  aria-label="User menu"
                >
                  {user.picture ? (
                    <img src={user.picture} alt="User" />
                  ) : (
                    user.name.slice(0, 1).toUpperCase()
                  )}
                </button>
                {showUserMenu && (
                  <div className="user-menu">
                    <button className="user-menu-item" onClick={openRecentGamesPage}>Recent Games</button>
                    <button className="user-menu-item" onClick={() => { setShowUserMenu(false); setCurrentPage("play"); }}>
                      Back To Play
                    </button>
                    <button className="btn btn-light" onClick={handleLogout}>Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google sign-in failed")}
                />
                {authLoading && <p className="auth-loading">Signing in...</p>}
              </div>
            )}
          </div>
        </header>

        {currentPage === "history" ? (
          <section className="history-page">
            <div className="history-toolbar">
              <h2>Recent Games</h2>
              <div className="history-actions">
                <button className="btn btn-light" onClick={() => void fetchRecentGames()} disabled={gamesLoading}>
                  {gamesLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button className="btn btn-dark" onClick={() => setCurrentPage("play")}>Back To Play</button>
              </div>
            </div>

            <div className="history-filters">
              <label>
                Result
                <select value={filterResult} onChange={(e) => setFilterResult(e.target.value as "all" | GameResult)}>
                  <option value="all">All</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="draw">Draw</option>
                  <option value="aborted">Aborted</option>
                </select>
              </label>
              <label>
                Difficulty
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value as "all" | DifficultyLevel)}
                >
                  <option value="all">All</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Side
                <select value={filterColor} onChange={(e) => setFilterColor(e.target.value as "all" | PlayerColor)}>
                  <option value="all">All</option>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </label>
              <label className="search-field">
                Search
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Result, date, difficulty, side..."
                />
              </label>
            </div>

            {gamesError && <div className="error-box">{gamesError}</div>}

            <div className="history-layout">
              <div className="history-list-panel">
                {gamesLoading ? (
                  <p className="history-empty">Loading games...</p>
                ) : filteredGames.length === 0 ? (
                  <p className="history-empty">No games match your filters yet.</p>
                ) : (
                  <div className="history-list">
                    {filteredGames.map((g) => (
                      <button
                        className={`history-card ${selectedGame?.id === g.id ? "is-active" : ""}`}
                        key={g.id}
                        onClick={() => setSelectedGameId(g.id)}
                      >
                        <div className="history-topline">
                          <span className={`result-pill result-${g.result}`}>{resultLabel(g.result)}</span>
                          <span>{formatDate(g.finished_at)}</span>
                        </div>
                        <div className="history-meta">
                          <span>Difficulty: <strong>{g.difficulty[0].toUpperCase() + g.difficulty.slice(1)}</strong></span>
                          <span>Side: <strong>{g.player_color === "white" ? "White" : "Black"}</strong></span>
                          <span>Moves: <strong>{g.move_history?.length ?? 0}</strong></span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <aside className="history-detail-panel">
                {selectedGame ? (
                  <>
                    <h3>Move Sequence</h3>
                    <div className="history-summary">
                      <span className={`result-pill result-${selectedGame.result}`}>{resultLabel(selectedGame.result)}</span>
                      <span>{formatDate(selectedGame.finished_at)}</span>
                    </div>
                    <div className="move-lines">
                      {movePairs(selectedGame.move_history ?? []).map((line, idx) => (
                        <div className="move-line" key={`${selectedGame.id}-${idx}`}>{line}</div>
                      ))}
                    </div>
                    {selectedGame.pgn && (
                      <div className="fen-block">
                        <span>PGN</span>
                        <code>{selectedGame.pgn}</code>
                      </div>
                    )}
                    {selectedGame.final_fen && (
                      <div className="fen-block">
                        <span>Final FEN</span>
                        <code>{selectedGame.final_fen}</code>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="history-empty">Select a game to inspect moves.</p>
                )}
              </aside>
            </div>
          </section>
        ) : isSetup ? (
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
