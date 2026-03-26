import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { googleLogout } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import AuthModal from "./components/modals/AuthModal";
import GameOverModal from "./components/modals/GameOverModal";
import HistoryPage from "./components/pages/HistoryPage";
import HomePage from "./components/pages/HomePage";
import MatchPage from "./components/pages/MatchPage";
import PlaySetupPage from "./components/pages/PlaySetupPage";
import type {
  AuthUser,
  DifficultyLevel,
  GameOverModalState,
  GameResult,
  PlayerColor,
  SavedGame,
} from "./types";
import { formatDate, movePairs, resultLabel, toLabel } from "./utils/gameFormat";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://chess-backend.agarwaladi.co.in";
const TOKEN_KEY = "chess_auth_token";
const USER_KEY = "chess_auth_user";

const sourceSquareStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 3px rgba(186, 123, 20, 0.96)",
};

const availableMoveStyle: CSSProperties = {
  background: "radial-gradient(circle, rgba(45, 120, 83, 0.45) 0%, rgba(45, 120, 83, 0.08) 55%, transparent 56%)",
};

const engineMoveStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 3px rgba(31, 115, 183, 0.82)",
};

const engineTargetStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 3px rgba(31, 115, 183, 0.82)",
  background: "radial-gradient(circle, rgba(31, 115, 183, 0.3) 0%, rgba(31, 115, 183, 0.08) 55%, transparent 56%)",
};

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

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
  const [status, setStatus] = useState("Pick a mode to begin.");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Square[]>([]);
  const [lastEngineMove, setLastEngineMove] = useState<{ from: Square; to: Square } | null>(null);
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

  const needsAuth = !authToken || !user;

  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};

    for (const target of selectedTargets) {
      styles[target] = availableMoveStyle;
    }

    if (selectedSquare) {
      styles[selectedSquare] = sourceSquareStyle;
    }

    if (lastEngineMove) {
      styles[lastEngineMove.from] = {
        ...(styles[lastEngineMove.from] ?? {}),
        ...engineMoveStyle,
      };
      styles[lastEngineMove.to] = {
        ...(styles[lastEngineMove.to] ?? {}),
        ...engineTargetStyle,
      };
    }

    return styles;
  }, [selectedSquare, selectedTargets, lastEngineMove]);

  function clearSelection() {
    setSelectedSquare(null);
    setSelectedTargets([]);
  }

  function toPlayerCode(side: PlayerColor): "w" | "b" {
    return side === "white" ? "w" : "b";
  }

  function canControlPiece(square: Square): boolean {
    if (!playerColor) return false;
    const piece = game.get(square);
    if (!piece) return false;
    return piece.color === toPlayerCode(playerColor);
  }

  function legalTargetsFor(square: Square): Square[] {
    return game.moves({ square, verbose: true }).map((move) => move.to as Square);
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
    navigate("/history");
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

      if (location.pathname === "/") {
        setStatus("Pick a mode to begin.");
      }
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
    navigate("/");
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
    clearSelection();

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
      setLastEngineMove({
        from: applied.from as Square,
        to: applied.to as Square,
      });

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
    clearSelection();
    setLastEngineMove(null);
    setGameOverModal({ visible: false, title: "", message: "" });
    navigate("/play/match");

    if (playerColor === "white") {
      setStatus("Your turn.");
      return;
    }

    setStatus("Computer plays first as White.");
    void requestEngineMove(fresh.fen());
  }

  function tryPlayerMove(from: Square, to: Square): boolean {
    if (isSetup || loading || !playerTurn || game.isGameOver()) {
      return false;
    }

    const piece = game.get(from);
    if (!piece) {
      return false;
    }

    const playerCode = playerColor ? toPlayerCode(playerColor) : "w";
    if (piece.color !== playerCode) {
      return false;
    }

    const next = new Chess(game.fen());
    const move = next.move({
      from,
      to,
      promotion: "q",
    });

    if (!move) {
      return false;
    }

    setMoveHistory((prev) => [...prev, move.san]);
    setGame(next);
    setError("");
    setBestMove("");
    clearSelection();

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

  function handleSquareClick(squareRaw: string) {
    if (isSetup || loading || !playerTurn || game.isGameOver()) {
      clearSelection();
      return;
    }

    const square = squareRaw as Square;

    if (!selectedSquare) {
      if (!canControlPiece(square)) {
        clearSelection();
        return;
      }

      setSelectedSquare(square);
      setSelectedTargets(legalTargetsFor(square));
      return;
    }

    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    if (canControlPiece(square)) {
      setSelectedSquare(square);
      setSelectedTargets(legalTargetsFor(square));
      return;
    }

    if (!tryPlayerMove(selectedSquare, square)) {
      clearSelection();
    }
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
    setStatus("Pick a mode to begin.");
    clearSelection();
    setLastEngineMove(null);
    setGameOverModal({ visible: false, title: "", message: "" });
    navigate("/play");
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

  useEffect(() => {
    if (location.pathname === "/history" && authToken) {
      void fetchRecentGames();
    }
  }, [location.pathname, authToken]);

  useEffect(() => {
    setShowUserMenu(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <div className="grain" aria-hidden="true" />

      <main className="board-page">
        <AppHeader
          user={user}
          showUserMenu={showUserMenu}
          onToggleUserMenu={() => setShowUserMenu((prev) => !prev)}
          onGoHome={() => navigate("/")}
          onGoHistory={openRecentGamesPage}
          onGoPlay={() => navigate("/play")}
          onLogout={handleLogout}
        />

        <Routes>
          <Route path="/" element={<HomePage onPlay={() => navigate("/play")} onAnalyze={openRecentGamesPage} />} />

          <Route
            path="/history"
            element={(
              <HistoryPage
                gamesLoading={gamesLoading}
                gamesError={gamesError}
                filteredGames={filteredGames}
                selectedGame={selectedGame}
                filterResult={filterResult}
                filterDifficulty={filterDifficulty}
                filterColor={filterColor}
                searchText={searchText}
                resultLabel={resultLabel}
                formatDate={formatDate}
                movePairs={movePairs}
                toLabel={toLabel}
                onRefresh={() => void fetchRecentGames()}
                onPlayNow={() => navigate("/play")}
                onSetFilterResult={setFilterResult}
                onSetFilterDifficulty={setFilterDifficulty}
                onSetFilterColor={setFilterColor}
                onSetSearchText={setSearchText}
                onSelectGame={setSelectedGameId}
              />
            )}
          />

          <Route
            path="/play"
            element={(
              <PlaySetupPage
                playerColor={playerColor}
                difficulty={difficulty}
                toLabel={toLabel}
                onSetPlayerColor={setPlayerColor}
                onSetDifficulty={setDifficulty}
                onStart={startGame}
              />
            )}
          />

          <Route
            path="/play/match"
            element={gameStarted ? (
              <MatchPage
                fen={fen}
                playerColor={playerColor}
                difficulty={difficulty}
                gameTurn={game.turn()}
                loading={loading}
                status={status}
                bestMove={bestMove}
                error={error}
                squareStyles={squareStyles}
                toLabel={toLabel}
                onSquareClick={handleSquareClick}
                onPieceDrop={tryPlayerMove}
                onReset={resetBoard}
              />
            ) : <Navigate to="/play" replace />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <footer className="hint-line">
          {location.pathname === "/"
            ? "Start with Play With Computer for a new game or Analyze to review your previous battles."
            : isSetup
              ? "Tip: choose Black if you want Stockfish to make the first move."
              : playerTurn
                ? "Your move: click your piece, click destination. Drag-and-drop also works."
                : "Wait for computer reply. Moves are disabled during engine turn."}
        </footer>
      </main>

      <GameOverModal
        modal={gameOverModal}
        onNewGame={resetBoard}
        onClose={() => setGameOverModal((prev) => ({ ...prev, visible: false }))}
      />

      {needsAuth && (
        <AuthModal
          authLoading={authLoading}
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google sign-in failed")}
        />
      )}

      <div className="corner-orb" aria-hidden="true" />
      <div className="corner-orb orb-two" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}
