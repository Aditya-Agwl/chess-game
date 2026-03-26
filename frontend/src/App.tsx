import { useEffect, useMemo, useRef, useState } from "react";
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
  TimeControl,
} from "./types";
import { formatDate, movePairs, resultLabel, toLabel } from "./utils/gameFormat";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://chess-backend.agarwaladi.co.in";
const TOKEN_KEY = "chess_auth_token";
const USER_KEY = "chess_auth_user";

type TimeControlPreset = {
  label: string;
  baseSeconds: number;
  incrementSeconds: number;
};

type GameSnapshot = {
  fen: string;
  moveHistory: string[];
  whiteTimeMs: number;
  blackTimeMs: number;
  activeTurnStartedAt: number;
  status: string;
  bestMove: string;
  lastEngineMove: { from: Square; to: Square } | null;
};

type ClockState = {
  white: number;
  black: number;
};

type ClockComputationOptions = {
  base?: ClockState;
  turn?: "w" | "b";
  turnStartedAt?: number | null;
  isLive?: boolean;
};

type EngineMoveClockContext = {
  base: ClockState;
  turnStartedAt: number;
};

const TIME_CONTROL_PRESETS: Record<TimeControl, TimeControlPreset> = {
  "3+2": { label: "3 min + 2 sec", baseSeconds: 180, incrementSeconds: 2 },
  "5+0": { label: "5 min", baseSeconds: 300, incrementSeconds: 0 },
  "10+0": { label: "10 min", baseSeconds: 600, incrementSeconds: 0 },
  "10+3": { label: "10 min + 3 sec", baseSeconds: 600, incrementSeconds: 3 },
  "15+10": { label: "15 min + 10 sec", baseSeconds: 900, incrementSeconds: 10 },
};

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
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [whiteTimeMs, setWhiteTimeMs] = useState(0);
  const [blackTimeMs, setBlackTimeMs] = useState(0);
  const [activeTurnStartedAt, setActiveTurnStartedAt] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [snapshots, setSnapshots] = useState<GameSnapshot[]>([]);
  const [timedOutLoser, setTimedOutLoser] = useState<"w" | "b" | null>(null);
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
  const engineRequestIdRef = useRef(0);

  const fen = useMemo(() => game.fen(), [game]);
  const isSetup = !gameStarted;
  const activePreset = timeControl ? TIME_CONTROL_PRESETS[timeControl] : null;
  const incrementMs = (activePreset?.incrementSeconds ?? 0) * 1000;
  const playerTurn =
    !isSetup && ((game.turn() === "w" && playerColor === "white") || (game.turn() === "b" && playerColor === "black"));
  const canUndo = !isSetup && snapshots.length > 1;

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

  function toTimeControlLabel(control: TimeControl): string {
    return TIME_CONTROL_PRESETS[control].label;
  }

  function formatClock(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function invalidateEngineRequests() {
    engineRequestIdRef.current += 1;
  }

  function setSnapshot(snapshot: GameSnapshot) {
    setGame(new Chess(snapshot.fen));
    setMoveHistory(snapshot.moveHistory);
    setWhiteTimeMs(snapshot.whiteTimeMs);
    setBlackTimeMs(snapshot.blackTimeMs);
    setActiveTurnStartedAt(snapshot.activeTurnStartedAt);
    setStatus(snapshot.status);
    setBestMove(snapshot.bestMove);
    setLastEngineMove(snapshot.lastEngineMove);
  }

  function pushSnapshot(snapshot: GameSnapshot) {
    setSnapshot(snapshot);
    setSnapshots((prev) => [...prev, snapshot]);
  }

  function currentClockState(now: number, options?: ClockComputationOptions): ClockState {
    let white = options?.base?.white ?? whiteTimeMs;
    let black = options?.base?.black ?? blackTimeMs;
    const turn = options?.turn ?? game.turn();
    const turnStartedAt = options?.turnStartedAt ?? activeTurnStartedAt;
    const isLive = options?.isLive ?? (gameStarted && !game.isGameOver());

    if (isLive && turnStartedAt !== null) {
      const elapsed = Math.max(0, now - turnStartedAt);
      if (turn === "w") {
        white = Math.max(0, white - elapsed);
      } else {
        black = Math.max(0, black - elapsed);
      }
    }

    return { white, black };
  }

  function settleMoverClock(
    mover: "w" | "b",
    now: number,
    options?: ClockComputationOptions,
  ): { white: number; black: number; timedOut: boolean } {
    const current = currentClockState(now, options);
    if (mover === "w") {
      if (current.white <= 0) {
        return { white: 0, black: current.black, timedOut: true };
      }
      return {
        white: current.white + incrementMs,
        black: current.black,
        timedOut: false,
      };
    }

    if (current.black <= 0) {
      return { white: current.white, black: 0, timedOut: true };
    }
    return {
      white: current.white,
      black: current.black + incrementMs,
      timedOut: false,
    };
  }

  function showTimeoutModal(loser: "w" | "b") {
    const loserColor: PlayerColor = loser === "w" ? "white" : "black";
    const youLost = loserColor === playerColor;
    setGameOverModal({
      visible: true,
      title: youLost ? "You Lost" : "You Won!",
      message: youLost ? "Your clock ran out." : "Computer ran out of time.",
    });
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

  async function saveGameIfNeeded(g: Chess, forcedResult?: GameResult, historyOverride?: string[]) {
    if (!authToken || !difficulty || !playerColor || gameSaved) return;

    const clocks = currentClockState(Date.now());
    const whiteLeft = timedOutLoser === "w" ? 0 : clocks.white;
    const blackLeft = timedOutLoser === "b" ? 0 : clocks.black;

    try {
      const res = await fetch(API_BASE + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          result: forcedResult ?? gameResultForPlayer(g),
          difficulty,
          player_color: playerColor,
          time_control: timeControl,
          initial_seconds: activePreset?.baseSeconds,
          increment_seconds: activePreset?.incrementSeconds,
          white_time_left_ms: Math.max(0, Math.round(whiteLeft)),
          black_time_left_ms: Math.max(0, Math.round(blackLeft)),
          timeout_loser: timedOutLoser === "w" ? "white" : timedOutLoser === "b" ? "black" : undefined,
          final_fen: g.fen(),
          move_history: historyOverride ?? moveHistory,
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

  function onTimeExpired(loser: "w" | "b") {
    if (!gameStarted || game.isGameOver() || !playerColor || timedOutLoser) return;

    invalidateEngineRequests();
    setLoading(false);
    setTimedOutLoser(loser);
    setError("");
    clearSelection();

    const loserLabel = loser === "w" ? "White" : "Black";
    setStatus(`${loserLabel} flagged on time.`);
    showTimeoutModal(loser);

    const result: GameResult = (loser === "w" ? "white" : "black") === playerColor ? "loss" : "win";
    void saveGameIfNeeded(game, result);
  }

  async function requestEngineMove(
    currentFen: string,
    historyBeforeMove: string[],
    clockContext: EngineMoveClockContext,
  ) {
    if (!difficulty) {
      setError("Difficulty is not selected.");
      return;
    }

    const requestId = engineRequestIdRef.current + 1;
    engineRequestIdRef.current = requestId;

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

      if (engineRequestIdRef.current !== requestId) {
        return;
      }

      if (!res.ok) {
        throw new Error(data.detail || "Request failed");
      }

      if (!data.best_move) {
        throw new Error("Missing best_move in response");
      }

      const move = data.best_move;
      const moveNow = Date.now();
      const currentPosition = new Chess(currentFen);
      const engineSide = currentPosition.turn();
      const settled = settleMoverClock(engineSide, moveNow, {
        base: clockContext.base,
        turn: engineSide,
        turnStartedAt: clockContext.turnStartedAt,
        isLive: true,
      });
      if (settled.timedOut) {
        onTimeExpired(engineSide);
        return;
      }

      const next = new Chess(currentFen);
      const applied = next.move({
        from: move.slice(0, 2) as Square,
        to: move.slice(2, 4) as Square,
        promotion: move.length > 4 ? move[4] : "q",
      });

      if (!applied) {
        throw new Error(`Engine returned an invalid move: ${move}`);
      }

      const nextMoveHistory = [...historyBeforeMove, applied.san];
      const nextStatus = next.isGameOver() ? gameOverMessage(next) : "Your turn.";
      const nextLastEngineMove = {
        from: applied.from as Square,
        to: applied.to as Square,
      };

      pushSnapshot({
        fen: next.fen(),
        moveHistory: nextMoveHistory,
        whiteTimeMs: settled.white,
        blackTimeMs: settled.black,
        activeTurnStartedAt: moveNow,
        status: nextStatus,
        bestMove: move,
        lastEngineMove: nextLastEngineMove,
      });

      if (next.isGameOver()) {
        showGameOverModal(next);
        void saveGameIfNeeded(next, undefined, nextMoveHistory);
      }
    } catch (e: unknown) {
      if (engineRequestIdRef.current !== requestId) {
        return;
      }
      setError(e instanceof Error ? e.message : "Could not fetch best move");
      setStatus("Computer move failed. Try again.");
    } finally {
      if (engineRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function startGame() {
    if (!playerColor || !difficulty || !timeControl) {
      setError("Please choose color, difficulty, and time control.");
      return;
    }

    invalidateEngineRequests();

    const fresh = new Chess();
    const now = Date.now();
    const preset = TIME_CONTROL_PRESETS[timeControl];
    const baseMs = preset.baseSeconds * 1000;
    const playerStarts = playerColor === "white";

    const initialSnapshot: GameSnapshot = {
      fen: fresh.fen(),
      moveHistory: [],
      whiteTimeMs: baseMs,
      blackTimeMs: baseMs,
      activeTurnStartedAt: now,
      status: playerStarts ? "Your turn." : "Computer plays first as White.",
      bestMove: "",
      lastEngineMove: null,
    };

    setGameStarted(true);
    setSnapshot(initialSnapshot);
    setSnapshots([initialSnapshot]);
    setStartedAt(new Date().toISOString());
    setGameSaved(false);
    setError("");
    setLoading(false);
    clearSelection();
    setGameOverModal({ visible: false, title: "", message: "" });
    navigate("/play/match");

    setTimedOutLoser(null);

    if (playerStarts) {
      return;
    }

    window.setTimeout(() => {
      void requestEngineMove(fresh.fen(), [], {
        base: { white: baseMs, black: baseMs },
        turnStartedAt: now,
      });
    }, 0);
  }

  function tryPlayerMove(from: Square, to: Square): boolean {
    if (isSetup || loading || !playerTurn || game.isGameOver() || timedOutLoser) {
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

    const moveNow = Date.now();
    const settled = settleMoverClock(playerCode, moveNow);
    if (settled.timedOut) {
      onTimeExpired(playerCode);
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

    const nextMoveHistory = [...moveHistory, move.san];
    const nextStatus = next.isGameOver() ? gameOverMessage(next) : "Computer is thinking...";

    pushSnapshot({
      fen: next.fen(),
      moveHistory: nextMoveHistory,
      whiteTimeMs: settled.white,
      blackTimeMs: settled.black,
      activeTurnStartedAt: moveNow,
      status: nextStatus,
      bestMove: "",
      lastEngineMove: null,
    });

    setError("");
    clearSelection();

    if (next.isGameOver()) {
      showGameOverModal(next);
      void saveGameIfNeeded(next, undefined, nextMoveHistory);
      return true;
    }

    void requestEngineMove(next.fen(), nextMoveHistory, {
      base: {
        white: settled.white,
        black: settled.black,
      },
      turnStartedAt: moveNow,
    });
    return true;
  }

  function undoLastTurn() {
    if (isSetup || !playerColor || snapshots.length <= 1) {
      return;
    }

    invalidateEngineRequests();
    setLoading(false);
    setError("");
    setTimedOutLoser(null);
    setGameSaved(false);
    clearSelection();
    setGameOverModal({ visible: false, title: "", message: "" });

    const currentHistory = game.history({ verbose: true });
    const latestMove = currentHistory[currentHistory.length - 1];
    const playerCode = toPlayerCode(playerColor);

    let removeCount = 1;
    if (latestMove?.color !== playerCode && snapshots.length > 2) {
      removeCount = 2;
    }

    const targetIndex = Math.max(0, snapshots.length - 1 - removeCount);
    const targetSnapshot = snapshots[targetIndex];
    const nextSnapshots = snapshots.slice(0, targetIndex + 1);

    setSnapshots(nextSnapshots);
    setSnapshot(targetSnapshot);

    const restored = new Chess(targetSnapshot.fen);
    if (restored.isGameOver()) {
      return;
    }

    if (restored.turn() !== playerCode) {
      void requestEngineMove(restored.fen(), targetSnapshot.moveHistory, {
        base: {
          white: targetSnapshot.whiteTimeMs,
          black: targetSnapshot.blackTimeMs,
        },
        turnStartedAt: targetSnapshot.activeTurnStartedAt,
      });
    }
  }

  function handleSquareClick(squareRaw: string) {
    if (isSetup || loading || !playerTurn || game.isGameOver() || timedOutLoser) {
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
    invalidateEngineRequests();
    setGameStarted(false);
    setPlayerColor(null);
    setDifficulty(null);
    setTimeControl(null);
    setGame(new Chess());
    setWhiteTimeMs(0);
    setBlackTimeMs(0);
    setActiveTurnStartedAt(null);
    setSnapshots([]);
    setTimedOutLoser(null);
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

  async function endGameAsLoss() {
    invalidateEngineRequests();
    setLoading(false);
    clearSelection();

    if (gameStarted && !game.isGameOver() && !timedOutLoser) {
      await saveGameIfNeeded(game, "loss");
    }

    resetBoard();
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
        || (g.time_control ?? "").includes(query)
      );
    });
  }, [recentGames, filterResult, filterDifficulty, filterColor, searchText]);

  const selectedGame = useMemo(
    () => filteredGames.find((g) => g.id === selectedGameId) ?? filteredGames[0] ?? null,
    [filteredGames, selectedGameId],
  );

  const displayClocks = useMemo(() => currentClockState(clockTick), [clockTick, whiteTimeMs, blackTimeMs, game, activeTurnStartedAt, isSetup]);
  const whiteClock = formatClock(displayClocks.white);
  const blackClock = formatClock(displayClocks.black);

  useEffect(() => {
    if (!gameStarted || isSetup || game.isGameOver()) {
      return;
    }

    const id = window.setInterval(() => {
      setClockTick(Date.now());
    }, 250);

    return () => window.clearInterval(id);
  }, [gameStarted, isSetup, game]);

  useEffect(() => {
    if (!gameStarted || isSetup || game.isGameOver() || !playerColor || !timeControl || timedOutLoser) {
      return;
    }

    const clocks = currentClockState(Date.now());
    if (game.turn() === "w" && clocks.white <= 0) {
      onTimeExpired("w");
      return;
    }
    if (game.turn() === "b" && clocks.black <= 0) {
      onTimeExpired("b");
    }
  }, [clockTick, game, gameStarted, isSetup, playerColor, timeControl, timedOutLoser]);

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
                timeControl={timeControl}
                toLabel={toLabel}
                toTimeControlLabel={toTimeControlLabel}
                onSetPlayerColor={setPlayerColor}
                onSetDifficulty={setDifficulty}
                onSetTimeControl={setTimeControl}
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
                timeControl={timeControl}
                gameTurn={game.turn()}
                loading={loading}
                status={status}
                bestMove={bestMove}
                whiteClock={whiteClock}
                blackClock={blackClock}
                activeClock={game.turn()}
                error={error}
                canUndo={canUndo}
                squareStyles={squareStyles}
                toLabel={toLabel}
                toTimeControlLabel={toTimeControlLabel}
                onSquareClick={handleSquareClick}
                onPieceDrop={tryPlayerMove}
                onUndo={undoLastTurn}
                onEndGame={endGameAsLoss}
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
