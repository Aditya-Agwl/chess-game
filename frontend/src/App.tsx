import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { googleLogout } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import AuthModal from "./components/modals/AuthModal";
import ConfirmActionModal from "./components/modals/ConfirmActionModal";
import GameOverModal from "./components/modals/GameOverModal";
import ConnectFourPage from "./components/pages/ConnectFourPage";
import HistoryPage from "./components/pages/HistoryPage";
import HomePage from "./components/pages/HomePage";
import MatchPage from "./components/pages/MatchPage";
import Game2048Page from "./components/pages/2048Page";
import MinesweeperPage from "./components/pages/MinesweeperPage";
import OthelloPage from "./components/pages/OthelloPage";
import PlaySetupPage from "./components/pages/PlaySetupPage";
import ProfilePage from "./components/pages/ProfilePage";
import SudokuPage from "./components/pages/SudokuPage";
import TicTacToePage from "./components/pages/TicTacToePage";
import UsersPage from "./components/pages/UsersPage";
import FriendsPage from "./components/pages/FriendsPage";
import NotificationsPage from "./components/pages/NotificationsPage";
import { ensureTicTacToeRealtime, fetchTicTacToeFriendInvites, subscribeTicTacToeRealtime } from "./api/tictactoe";
import type {
  AuthUser,
  DifficultyLevel,
  FriendActionType,
  GameType,
  GameOverModalState,
  GameResult,
  PlayerColor,
  ProfileSummary,
  SavedGame,
  SocialOverview,
  SocialUser,
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

  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState("");
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [usersSearchText, setUsersSearchText] = useState("");
  const [usersList, setUsersList] = useState<SocialUser[]>([]);
  const [friendsOverview, setFriendsOverview] = useState<SocialOverview | null>(null);
  const [actionLoadingById, setActionLoadingById] = useState<Record<string, FriendActionType | undefined>>({});
  const [pendingUnfriendUser, setPendingUnfriendUser] = useState<SocialUser | null>(null);
  const [tttInviteCount, setTttInviteCount] = useState(0);

  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [recentGames, setRecentGames] = useState<SavedGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [filterGameType, setFilterGameType] = useState<"all" | GameType>("all");
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

  async function loadProfileSummary() {
    if (!authToken) return;
    setSocialLoading(true);
    setSocialError("");
    try {
      const res = await fetch(API_BASE + "/profile", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data: ProfileSummary & { detail?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch profile");
      }
      setProfileSummary(data);
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not fetch profile");
    } finally {
      setSocialLoading(false);
    }
  }

  async function loadUsers(query?: string) {
    if (!authToken) return;
    setSocialLoading(true);
    setSocialError("");
    try {
      const q = (query ?? usersSearchText).trim();
      const qs = q ? `?limit=80&q=${encodeURIComponent(q)}` : "?limit=80";
      const res = await fetch(API_BASE + "/users" + qs, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data: { users?: SocialUser[]; detail?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch users");
      }
      setUsersList(data.users ?? []);
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not fetch users");
    } finally {
      setSocialLoading(false);
    }
  }

  async function loadFriendsOverview() {
    if (!authToken) return;
    setSocialLoading(true);
    setSocialError("");
    try {
      const res = await fetch(API_BASE + "/friends", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data: (SocialOverview & { detail?: string }) = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not fetch friends");
      }
      setFriendsOverview(data);
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not fetch friends");
    } finally {
      setSocialLoading(false);
    }
  }

  function setActionLoading(userId: string, action: FriendActionType | undefined) {
    setActionLoadingById((prev) => ({ ...prev, [userId]: action }));
  }

  async function withSocialRefresh(action: () => Promise<void>) {
    await action();
    await Promise.all([
      loadProfileSummary(),
      loadUsers(),
      loadFriendsOverview(),
    ]);
  }

  async function sendFriendRequest(targetUserId: string) {
    if (!authToken) return;
    setActionLoading(targetUserId, "add");
    setSocialError("");
    try {
      await withSocialRefresh(async () => {
        const res = await fetch(API_BASE + "/friends/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ target_user_id: targetUserId }),
        });
        const data: { detail?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Could not send request");
        }
      });
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setActionLoading(targetUserId, undefined);
    }
  }

  async function respondToRequest(fromUserId: string, action: "accept" | "reject") {
    if (!authToken) return;
    setActionLoading(fromUserId, action);
    setSocialError("");
    try {
      await withSocialRefresh(async () => {
        const res = await fetch(API_BASE + `/friends/requests/${fromUserId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ action }),
        });
        const data: { detail?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || `Could not ${action} request`);
        }
      });
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : `Could not ${action} request`);
    } finally {
      setActionLoading(fromUserId, undefined);
    }
  }

  async function cancelOutgoingRequest(toUserId: string) {
    if (!authToken) return;
    setActionLoading(toUserId, "cancel");
    setSocialError("");
    try {
      await withSocialRefresh(async () => {
        const res = await fetch(API_BASE + `/friends/requests/${toUserId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const data: { detail?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Could not cancel request");
        }
      });
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not cancel request");
    } finally {
      setActionLoading(toUserId, undefined);
    }
  }

  async function unfriendUser(friendUserId: string): Promise<boolean> {
    if (!authToken) return false;
    setActionLoading(friendUserId, "unfriend");
    setSocialError("");
    try {
      await withSocialRefresh(async () => {
        const res = await fetch(API_BASE + `/friends/${friendUserId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const data: { detail?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Could not remove friend");
        }
      });
      return true;
    } catch (e: unknown) {
      setSocialError(e instanceof Error ? e.message : "Could not remove friend");
      return false;
    } finally {
      setActionLoading(friendUserId, undefined);
    }
  }

  function requestUnfriend(userToRemove: SocialUser) {
    setPendingUnfriendUser(userToRemove);
  }

  async function confirmUnfriend() {
    if (!pendingUnfriendUser) return;
    const ok = await unfriendUser(pendingUnfriendUser.id);
    if (ok) {
      setPendingUnfriendUser(null);
    }
  }

  function openRecentGamesPage() {
    setShowUserMenu(false);
    navigate("/history");
  }

  function openProfilePage() {
    setShowUserMenu(false);
    navigate("/profile");
  }

  function openUsersPage() {
    setShowUserMenu(false);
    navigate("/users");
  }

  function openFriendsPage() {
    setShowUserMenu(false);
    navigate("/friends");
  }

  function openNotificationsPage() {
    setShowUserMenu(false);
    navigate("/notifications");
  }

  async function refreshTicTacToeInviteCount() {
    if (!authToken) {
      setTttInviteCount(0);
      return;
    }

    try {
      const data = await fetchTicTacToeFriendInvites(API_BASE, authToken);
      setTttInviteCount(data.incoming_count ?? 0);
    } catch {
      // Keep header responsive even if notifications endpoint fails.
    }
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
          game_type: "chess",
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
    setProfileSummary(null);
    setUsersList([]);
    setFriendsOverview(null);
    setUsersSearchText("");
    setActionLoadingById({});
    setPendingUnfriendUser(null);
    setTttInviteCount(0);
    setSocialError("");
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
    navigate("/chess/match");

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
    navigate("/chess");
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
      const gameType = g.game_type ?? "chess";
      if (filterGameType !== "all" && gameType !== filterGameType) return false;
      if (filterResult !== "all" && g.result !== filterResult) return false;
      if (filterDifficulty !== "all" && g.difficulty !== filterDifficulty) return false;
      if (filterColor !== "all" && g.player_color !== filterColor) return false;
      if (!query) return true;

      const dateText = formatDate(g.finished_at).toLowerCase();
      const pgnText = (g.pgn ?? "").toLowerCase();
      return (
        dateText.includes(query)
        || pgnText.includes(query)
        || gameType.includes(query)
        || g.result.includes(query)
        || g.difficulty.includes(query)
        || (g.player_color ?? "").includes(query)
        || (g.time_control ?? "").includes(query)
      );
    });
  }, [recentGames, filterGameType, filterResult, filterDifficulty, filterColor, searchText]);

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
    if (location.pathname === "/profile" && authToken) {
      void loadProfileSummary();
    }
    if (location.pathname === "/users" && authToken) {
      void loadUsers();
    }
    if (location.pathname === "/friends" && authToken) {
      void loadFriendsOverview();
    }
  }, [location.pathname, authToken]);

  useEffect(() => {
    if (!authToken) {
      setTttInviteCount(0);
      return;
    }

    ensureTicTacToeRealtime(API_BASE, authToken);
    void refreshTicTacToeInviteCount();
    const id = window.setInterval(() => {
      void refreshTicTacToeInviteCount();
    }, 15000);

    return () => window.clearInterval(id);
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    const unsubscribe = subscribeTicTacToeRealtime((message) => {
      if (message.event === "ttt.invite.created" || message.event === "ttt.invite.updated") {
        void refreshTicTacToeInviteCount();
      }
    });

    return unsubscribe;
  }, [authToken]);

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
          onGoProfile={openProfilePage}
          onGoUsers={openUsersPage}
          onGoFriends={openFriendsPage}
          onGoNotifications={openNotificationsPage}
          notificationCount={tttInviteCount}
          onGoHome={() => navigate("/")}
          onGoHistory={openRecentGamesPage}
          onLogout={handleLogout}
        />

        <Routes>
          <Route
            path="/"
            element={(
              <HomePage
                onPlayChess={() => navigate("/chess")}
                onPlaySudoku={() => navigate("/sudoku")}
                onPlayTicTacToe={() => navigate("/tictactoe/settings")}
                onPlayConnectFour={() => navigate("/connect4/settings")}
                onPlayOthello={() => navigate("/othello/settings/mode")}
                onPlayMinesweeper={() => navigate("/minesweeper/settings")}
                onPlay2048={() => navigate("/2048/settings")}
              />
            )}
          />

          <Route
            path="/profile"
            element={(
              <ProfilePage
                user={user}
                profile={profileSummary}
                loading={socialLoading}
                error={socialError}
                onRefresh={() => void loadProfileSummary()}
                onOpenUsers={openUsersPage}
                onOpenFriends={openFriendsPage}
              />
            )}
          />

          <Route
            path="/users"
            element={(
              <UsersPage
                users={usersList}
                searchText={usersSearchText}
                loading={socialLoading}
                error={socialError}
                actionLoadingById={actionLoadingById}
                onChangeSearchText={setUsersSearchText}
                onSearch={() => void loadUsers()}
                onAddFriend={(userId) => void sendFriendRequest(userId)}
                onAcceptRequest={(userId) => void respondToRequest(userId, "accept")}
                onRejectRequest={(userId) => void respondToRequest(userId, "reject")}
                onCancelRequest={(userId) => void cancelOutgoingRequest(userId)}
                onUnfriend={requestUnfriend}
              />
            )}
          />

          <Route
            path="/friends"
            element={(
              <FriendsPage
                overview={friendsOverview}
                loading={socialLoading}
                error={socialError}
                actionLoadingById={actionLoadingById}
                onRefresh={() => void loadFriendsOverview()}
                onAcceptRequest={(userId) => void respondToRequest(userId, "accept")}
                onRejectRequest={(userId) => void respondToRequest(userId, "reject")}
                onCancelRequest={(userId) => void cancelOutgoingRequest(userId)}
                onUnfriend={requestUnfriend}
              />
            )}
          />

          <Route
            path="/notifications"
            element={(
              <NotificationsPage
                authToken={authToken}
                apiBase={API_BASE}
                onIncomingCountChange={setTttInviteCount}
                onStartTicTacToeMatch={(matchId) => {
                  navigate("/tictactoe/play", {
                    state: {
                      mode: "friend",
                      difficulty: "medium",
                      playerMark: "X",
                      boardSize: 3,
                      matchId,
                    },
                  });
                }}
                onStartConnect4Match={(matchId) => {
                  navigate("/connect4/play", {
                    state: {
                      mode: "friend",
                      difficulty: "medium",
                      playerDisc: "R",
                      matchId,
                    },
                  });
                }}
              />
            )}
          />

          <Route
            path="/history"
            element={(
              <HistoryPage
                gamesLoading={gamesLoading}
                gamesError={gamesError}
                filteredGames={filteredGames}
                selectedGame={selectedGame}
                filterGameType={filterGameType}
                filterResult={filterResult}
                filterDifficulty={filterDifficulty}
                filterColor={filterColor}
                searchText={searchText}
                resultLabel={resultLabel}
                formatDate={formatDate}
                movePairs={movePairs}
                toLabel={toLabel}
                onRefresh={() => void fetchRecentGames()}
                onPlayNow={() => navigate("/chess")}
                onSetFilterGameType={setFilterGameType}
                onSetFilterResult={setFilterResult}
                onSetFilterDifficulty={setFilterDifficulty}
                onSetFilterColor={setFilterColor}
                onSetSearchText={setSearchText}
                onSelectGame={setSelectedGameId}
              />
            )}
          />

          <Route
            path="/sudoku"
            element={(
              <SudokuPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
              />
            )}
          />

          <Route
            path="/tictactoe/settings"
            element={(
              <TicTacToePage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/tictactoe/play"
            element={(
              <TicTacToePage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="play"
              />
            )}
          />

          <Route
            path="/tictactoe"
            element={(
              <Navigate to="/tictactoe/settings" replace />
            )}
          />

          <Route
            path="/connect4/settings"
            element={(
              <ConnectFourPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/connect4/play"
            element={(
              <ConnectFourPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="play"
              />
            )}
          />

          <Route
            path="/connect4"
            element={(
              <Navigate to="/connect4/settings" replace />
            )}
          />

          <Route
            path="/minesweeper/settings"
            element={(
              <MinesweeperPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/minesweeper/play"
            element={(
              <MinesweeperPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="play"
              />
            )}
          />

          <Route
            path="/minesweeper"
            element={(
              <Navigate to="/minesweeper/settings" replace />
            )}
          />

          <Route
            path="/2048/settings"
            element={(
              <Game2048Page
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/2048/play"
            element={(
              <Game2048Page
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="play"
              />
            )}
          />

          <Route
            path="/2048"
            element={(
              <Navigate to="/2048/settings" replace />
            )}
          />
          <Route
            path="/othello/settings"
            element={(
              <Navigate to="/othello/settings/mode" replace />
            )}
          />

          <Route
            path="/othello/settings/mode"
            element={(
              <OthelloPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/othello/settings/game"
            element={(
              <OthelloPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="settings"
              />
            )}
          />

          <Route
            path="/othello/play"
            element={(
              <OthelloPage
                authToken={authToken}
                apiBase={API_BASE}
                onOpenHistory={openRecentGamesPage}
                routeMode="play"
              />
            )}
          />

          <Route
            path="/othello"
            element={(
              <Navigate to="/othello/settings" replace />
            )}
          />

          <Route
            path="/othello/*"
            element={(
              <Navigate to="/othello/settings/mode" replace />
            )}
          />

          <Route
            path="/chess"
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
            path="/chess/match"
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
            ) : <Navigate to="/chess" replace />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <footer className="hint-line">
          {location.pathname === "/"
            ? "Pick Chess, Sudoku, Tic Tac Toe, Connect 4, Othello, or Minesweeper to jump into your game universe."
            : location.pathname === "/profile"
              ? "This is your player profile. Track your friend network and launch friend matches from notifications."
            : location.pathname === "/users"
              ? "Search players, send friend requests, and accept incoming invites."
            : location.pathname === "/friends"
              ? "Manage accepted friends and pending requests from one place."
            : location.pathname === "/notifications"
              ? "Review Tic Tac Toe and Connect 4 friend invites, accept requests, and jump into active matches."
            : location.pathname === "/sudoku"
              ? "Use the number pad to fill cells. Every completed puzzle is stored in your history."
              : location.pathname.startsWith("/tictactoe")
                ? "Pick Local, AI, or Friend mode in settings, then start your Tic-Tac-Toe match."
                : location.pathname.startsWith("/connect4")
                  ? "Take turns dropping discs. First to connect four horizontally, vertically, or diagonally wins."
                  : location.pathname === "/minesweeper"
                    ? "Left-click to reveal, right-click to flag. Avoid mines and clear the board to win."
              : location.pathname.startsWith("/othello")
                  ? "Corners matter: every move can flip lines. If no legal move exists, pass turn."
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

      <ConfirmActionModal
        visible={Boolean(pendingUnfriendUser)}
        title="Remove Friend"
        message={pendingUnfriendUser ? `Remove ${pendingUnfriendUser.name} from your friends list?` : ""}
        confirmLabel="Yes, Unfriend"
        cancelLabel="Cancel"
        confirmBusy={Boolean(pendingUnfriendUser && actionLoadingById[pendingUnfriendUser.id] === "unfriend")}
        onConfirm={() => void confirmUnfriend()}
        onCancel={() => setPendingUnfriendUser(null)}
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
