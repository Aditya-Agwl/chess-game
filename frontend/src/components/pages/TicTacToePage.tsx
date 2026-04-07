import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ensureTicTacToeRealtime,
  fetchFriendsForTicTacToeInvite,
  fetchTicTacToeBestMove,
  fetchTicTacToeFriendMatch,
  playTicTacToeFriendMove,
  saveTicTacToeGame,
  sendTicTacToeRealtimeMessage,
  sendTicTacToeFriendInvite,
  subscribeTicTacToeRealtime,
  type TicTacToeFriendMatch,
  type TicTacToeMark,
  type TicTacToeMode,
  type TicTacToeWinner,
} from "../../api/tictactoe";
import type { DifficultyLevel, GameResult, SocialUser } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
  routeMode: "settings" | "play";
};

type Cell = "" | TicTacToeMark;

const DIFFICULTY_OPTIONS: DifficultyLevel[] = ["easy", "medium", "hard"];
const BOARD_SIZE_OPTIONS = [3, 4, 5] as const;

type TicTacToeRouteState = {
  mode: TicTacToeMode;
  difficulty: DifficultyLevel;
  playerMark: TicTacToeMark;
  boardSize: number;
  matchId?: string;
};

type SaveSnapshot = {
  board?: Cell[];
  moveHistory?: string[];
  winner?: TicTacToeWinner | null;
};

function createBoard(size: number): Cell[] {
  return new Array(size * size).fill("");
}

function toBoardString(board: Cell[]): string {
  return board.map((cell) => (cell === "" ? "-" : cell)).join("");
}

function boardFromString(boardString: string): Cell[] {
  return boardString.split("").map((cell) => (cell === "-" ? "" : (cell as TicTacToeMark)));
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function winningLines(boardSize: number): number[][] {
  const lines: number[][] = [];

  for (let row = 0; row < boardSize; row += 1) {
    lines.push(Array.from({ length: boardSize }, (_, col) => row * boardSize + col));
  }

  for (let col = 0; col < boardSize; col += 1) {
    lines.push(Array.from({ length: boardSize }, (_, row) => row * boardSize + col));
  }

  lines.push(Array.from({ length: boardSize }, (_, i) => i * boardSize + i));
  lines.push(Array.from({ length: boardSize }, (_, i) => i * boardSize + (boardSize - 1 - i)));

  return lines;
}

function winnerFor(board: Cell[], boardSize: number): TicTacToeWinner | null {
  for (const line of winningLines(boardSize)) {
    const first = board[line[0]];
    if (first !== "" && line.every((idx) => board[idx] === first)) {
      return first;
    }
  }

  if (board.every((cell) => cell !== "")) {
    return "draw";
  }

  return null;
}

function markForTurn(moveCount: number): TicTacToeMark {
  return moveCount % 2 === 0 ? "X" : "O";
}

function isPlayerTurnInAi(moveCount: number, playerMark: TicTacToeMark): boolean {
  return moveCount % 2 === (playerMark === "X" ? 0 : 1);
}

function squareLabel(index: number, boardSize: number): string {
  const row = Math.floor(index / boardSize) + 1;
  const col = (index % boardSize) + 1;
  return `R${row}C${col}`;
}

function fromMatchWinner(value: TicTacToeWinner | null): TicTacToeWinner | null {
  if (value === "X" || value === "O" || value === "draw") return value;
  return null;
}

export default function TicTacToePage({ authToken, apiBase, onOpenHistory, routeMode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedMode, setSelectedMode] = useState<TicTacToeMode>("ai");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("medium");
  const [selectedPlayerMark, setSelectedPlayerMark] = useState<TicTacToeMark>("X");
  const [selectedBoardSize, setSelectedBoardSize] = useState<number>(3);

  const [friendCandidates, setFriendCandidates] = useState<SocialUser[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const [gameMode, setGameMode] = useState<TicTacToeMode>("ai");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [playerMark, setPlayerMark] = useState<TicTacToeMark>("X");
  const [boardSize, setBoardSize] = useState<number>(3);
  const [friendMatchId, setFriendMatchId] = useState<string | null>(null);

  const [gameStarted, setGameStarted] = useState(false);
  const [board, setBoard] = useState<Cell[]>(createBoard(3));
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadingMove, setLoadingMove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [winner, setWinner] = useState<TicTacToeWinner | null>(null);
  const [saved, setSaved] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());
  const [lastAiMoveIndex, setLastAiMoveIndex] = useState<number | null>(null);

  const gameOver = winner !== null;
  const isAiGame = gameMode === "ai";
  const isLocalGame = gameMode === "local";
  const isFriendGame = gameMode === "friend";
  const aiMark: TicTacToeMark = playerMark === "X" ? "O" : "X";
  const currentTurn = markForTurn(moveHistory.length);
  const playerTurn = isPlayerTurnInAi(moveHistory.length, playerMark);
  const friendTurn = currentTurn === playerMark;

  const turnLabel = gameOver
    ? "Finished"
    : isFriendGame
      ? friendTurn
        ? "You"
        : "Friend"
      : isLocalGame
        ? currentTurn
        : loadingMove
          ? "AI"
          : playerTurn
            ? "You"
            : "AI";

  const boardStyle = useMemo<CSSProperties>(
    () => ({
      width: `min(${Math.min(620, boardSize * 120)}px, 100%)`,
      gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
    }),
    [boardSize],
  );

  const cellFontSize = boardSize >= 5 ? "1.35rem" : boardSize === 4 ? "1.7rem" : "2rem";

  const status = useMemo(() => {
    if (!gameStarted) return "Open settings and start a game.";
    if (isFriendGame) {
      if (!friendMatchId) return "No active match selected. Open notifications and accept an invite.";
      if (gameOver) return winner === "draw" ? "Draw game." : `${winner} wins.`;
      return friendTurn ? "Your turn." : "Waiting for your friend to play...";
    }
    if (gameOver) return winner === "draw" ? "Draw game." : `${winner} wins.`;
    if (isLocalGame) return `${currentTurn} to play.`;
    if (loadingMove) return "Computer is thinking...";
    return playerTurn ? `Your move. You are ${playerMark}.` : "Computer is thinking...";
  }, [gameStarted, isFriendGame, friendMatchId, gameOver, winner, friendTurn, isLocalGame, currentTurn, loadingMove, playerTurn, playerMark]);

  function resultForWinner(nextWinner: TicTacToeWinner): GameResult {
    if (nextWinner === "draw") return "draw";
    return nextWinner === playerMark ? "win" : "loss";
  }

  function applyFriendMatch(match: TicTacToeFriendMatch, showModalOnFinish = false) {
    setGameMode("friend");
    setGameStarted(true);
    setDifficulty("medium");
    setBoardSize(match.board_size);
    setPlayerMark(match.my_mark);
    setFriendMatchId(match.id);
    setBoard(boardFromString(match.board));
    setMoveHistory(match.move_history ?? []);
    setWinner(fromMatchWinner(match.winner));
    setShowResultModal(showModalOnFinish && match.status === "finished");
    setError("");
    setLastAiMoveIndex(null);
    if (match.created_at) {
      setStartedAt(match.created_at);
    }
  }

  async function loadFriendMatch(matchId: string, showModalOnFinish = false) {
    if (!authToken) return;
    try {
      const match = await fetchTicTacToeFriendMatch(apiBase, authToken, matchId);
      applyFriendMatch(match, showModalOnFinish);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load friend match");
    }
  }

  async function saveTicTacToeIfNeeded(
    forcedResult?: GameResult,
    forcedWinner?: TicTacToeWinner,
    snapshot?: SaveSnapshot,
  ) {
    if (!authToken || saved || !gameStarted || isFriendGame) return;

    setSaving(true);
    try {
      const resolvedWinner = forcedWinner ?? snapshot?.winner ?? winner;
      const result = forcedResult ?? (resolvedWinner ? resultForWinner(resolvedWinner) : "aborted");
      const resolvedBoard = snapshot?.board ?? board;
      const resolvedHistory = snapshot?.moveHistory ?? moveHistory;

      await saveTicTacToeGame(apiBase, authToken, {
        game_type: "tictactoe",
        result,
        difficulty,
        tictactoe_board: toBoardString(resolvedBoard),
        tictactoe_player_mark: playerMark,
        tictactoe_winner: resolvedWinner ?? undefined,
        tictactoe_move_history: resolvedHistory,
        tictactoe_elapsed_seconds: elapsedSeconds,
        tictactoe_mode: gameMode,
        tictactoe_board_size: boardSize,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Tic Tac Toe game");
    } finally {
      setSaving(false);
    }
  }

  async function requestAiMove(nextBoard: Cell[], history: string[], config: TicTacToeRouteState) {
    setLoadingMove(true);
    setError("");
    try {
      const data = await fetchTicTacToeBestMove(apiBase, {
        board: toBoardString(nextBoard),
        difficulty: config.difficulty,
        ai_mark: config.playerMark === "X" ? "O" : "X",
        board_size: config.boardSize,
      });

      const index = data.index;
      if (index < 0 || index >= nextBoard.length || nextBoard[index] !== "") {
        throw new Error("AI returned invalid move");
      }

      const afterAi = [...nextBoard];
      const currentAiMark: TicTacToeMark = config.playerMark === "X" ? "O" : "X";
      afterAi[index] = currentAiMark;

      const updatedHistory = [...history, `${currentAiMark} -> ${squareLabel(index, config.boardSize)}`];
      const nextWinner = winnerFor(afterAi, config.boardSize);

      setBoard(afterAi);
      setMoveHistory(updatedHistory);
      setLastAiMoveIndex(index);

      if (nextWinner) {
        setWinner(nextWinner);
        setShowResultModal(true);
        void saveTicTacToeIfNeeded(undefined, nextWinner, {
          board: afterAi,
          moveHistory: updatedHistory,
          winner: nextWinner,
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch AI move");
    } finally {
      setLoadingMove(false);
    }
  }

  function launchGame(config: TicTacToeRouteState) {
    const freshBoard = createBoard(config.boardSize);

    setGameMode(config.mode);
    setDifficulty(config.difficulty);
    setPlayerMark(config.playerMark);
    setBoardSize(config.boardSize);
    setFriendMatchId(config.matchId ?? null);

    setGameStarted(true);
    setBoard(freshBoard);
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

    if (config.mode === "ai" && config.playerMark === "O") {
      window.setTimeout(() => {
        void requestAiMove(freshBoard, [], config);
      }, 0);
    }
  }

  function startNewGame() {
    if (isFriendGame && friendMatchId) {
      void loadFriendMatch(friendMatchId);
      return;
    }

    launchGame({
      mode: gameMode,
      difficulty,
      playerMark,
      boardSize,
      matchId: friendMatchId ?? undefined,
    });
  }

  async function endTicTacToe() {
    if (gameOver || isFriendGame) return;
    await saveTicTacToeIfNeeded("aborted");
  }

  async function sendFriendRequest() {
    if (!authToken || !selectedFriendId) return;

    setInviteSending(true);
    setInviteMessage("");
    setError("");
    try {
      const result = await sendTicTacToeFriendInvite(apiBase, authToken, selectedFriendId, selectedBoardSize);
      setInviteMessage(result.detail || "Request sent.");
      navigate("/notifications");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send game invite");
    } finally {
      setInviteSending(false);
    }
  }

  async function playFriendMove(index: number) {
    if (!authToken || !friendMatchId) return;

    const sent = sendTicTacToeRealtimeMessage({
      type: "ttt_friend_move",
      match_id: friendMatchId,
      index,
    });

    if (sent) {
      setLoadingMove(true);
      window.setTimeout(() => {
        setLoadingMove(false);
      }, 2200);
      return;
    }

    setLoadingMove(true);
    setError("");
    try {
      const match = await playTicTacToeFriendMove(apiBase, authToken, friendMatchId, index);
      applyFriendMatch(match, true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit move");
    } finally {
      setLoadingMove(false);
    }
  }

  function playAt(index: number) {
    if (!gameStarted || loadingMove || gameOver || board[index] !== "") return;

    if (isFriendGame) {
      if (!friendTurn) return;
      void playFriendMove(index);
      return;
    }

    if (isAiGame && !playerTurn) return;

    const next = [...board];
    const mark: TicTacToeMark = isAiGame ? playerMark : currentTurn;
    next[index] = mark;
    setLastAiMoveIndex(null);

    const history = [...moveHistory, `${mark} -> ${squareLabel(index, boardSize)}`];
    const nextWinner = winnerFor(next, boardSize);

    setBoard(next);
    setMoveHistory(history);

    if (nextWinner) {
      setWinner(nextWinner);
      setShowResultModal(true);
      void saveTicTacToeIfNeeded(undefined, nextWinner, {
        board: next,
        moveHistory: history,
        winner: nextWinner,
      });
      return;
    }

    if (isAiGame) {
      void requestAiMove(next, history, {
        mode: gameMode,
        difficulty,
        playerMark,
        boardSize,
      });
    }
  }

  useEffect(() => {
    if (routeMode !== "settings" || selectedMode !== "friend" || !authToken) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const friends = await fetchFriendsForTicTacToeInvite(apiBase, authToken);
        if (cancelled) return;
        setFriendCandidates(friends);
        setSelectedFriendId((prev) => prev || friends[0]?.id || "");
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load friends");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeMode, selectedMode, authToken]);

  useEffect(() => {
    if (authToken) {
      ensureTicTacToeRealtime(apiBase, authToken);
    }

    if (!authToken) return;

    return subscribeTicTacToeRealtime((message) => {
      if (message.event === "realtime.connected" && friendMatchId) {
        sendTicTacToeRealtimeMessage({
          type: "subscribe_match",
          match_id: friendMatchId,
        });
      }

      if (message.event === "ttt.match.updated") {
        const payloadMatchId = String(message.payload.match_id ?? "");
        if (payloadMatchId && friendMatchId && payloadMatchId === friendMatchId) {
          setLoadingMove(false);
          void loadFriendMatch(payloadMatchId, true);
        }
      }
    });
  }, [authToken, friendMatchId]);

  useEffect(() => {
    if (!isFriendGame || !friendMatchId) return;

    sendTicTacToeRealtimeMessage({
      type: "subscribe_match",
      match_id: friendMatchId,
    });

    return () => {
      sendTicTacToeRealtimeMessage({
        type: "unsubscribe_match",
        match_id: friendMatchId,
      });
    };
  }, [isFriendGame, friendMatchId]);

  useEffect(() => {
    if (routeMode !== "play") return;

    const state = (location.state as TicTacToeRouteState | null) ?? null;
    if (!state) {
      setError("Open Tic-Tac-Toe settings first, then start a game.");
      setGameStarted(false);
      return;
    }

    const isValidBoardSize = BOARD_SIZE_OPTIONS.includes(state.boardSize as (typeof BOARD_SIZE_OPTIONS)[number]);
    if (!isValidBoardSize) {
      setError("Invalid board size selected.");
      setGameStarted(false);
      return;
    }

    if (state.mode === "friend") {
      if (!state.matchId) {
        setError("Open Notifications and accept a friend invite to start playing.");
        setGameStarted(false);
        return;
      }
      void loadFriendMatch(state.matchId);
      return;
    }

    setError("");
    launchGame(state);
  }, [routeMode, location.state]);

  useEffect(() => {
    if (!gameStarted || gameOver || isFriendGame) return;
    const id = window.setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [gameStarted, gameOver, isFriendGame]);

  useEffect(() => {
    if (!isFriendGame || !friendMatchId || !gameStarted || gameOver || !authToken) return;

    // Slow fallback sync in case websocket is interrupted.
    const id = window.setInterval(() => {
      void loadFriendMatch(friendMatchId);
    }, 12000);

    return () => window.clearInterval(id);
  }, [isFriendGame, friendMatchId, gameStarted, gameOver, authToken]);

  if (routeMode === "settings") {
    const canStart =
      selectedMode === "ai"
        ? Boolean(selectedDifficulty && selectedPlayerMark)
        : selectedMode === "friend"
          ? false
          : true;

    return (
      <section className="setup-card othello-settings-card ttt-settings-card">
        <div className="othello-settings-head">
          <h2>Tic Tac Toe Setup</h2>
          <span className="othello-step-pill">Ready Room</span>
        </div>
        <p>Choose mode, board size, and game options before launching.</p>

        <h3 className="setup-subtitle">Game Mode</h3>
        <div className="othello-mode-grid ttt-mode-grid" role="group" aria-label="Tic Tac Toe mode selection">
          <button
            className={`othello-mode-card ${selectedMode === "local" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("local");
              setError("");
            }}
          >
            <strong>Local 2-Player</strong>
            <span>Play turns on the same device, classic couch mode.</span>
          </button>
          <button
            className={`othello-mode-card is-ai ${selectedMode === "ai" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("ai");
              setError("");
            }}
          >
            <strong>Play vs AI</strong>
            <span>Train with difficulty levels and scalable boards.</span>
          </button>
          <button
            className={`othello-mode-card ${selectedMode === "friend" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("friend");
              setError("");
            }}
          >
            <strong>Play a Friend</strong>
            <span>Invite a friend, then play in a shared persisted match.</span>
          </button>
        </div>

        <h3 className="setup-subtitle">Board Size</h3>
        <div className="difficulty-actions">
          {BOARD_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              className={`btn btn-difficulty ${selectedBoardSize === size ? "is-selected" : ""}`}
              onClick={() => setSelectedBoardSize(size)}
            >
              {size} x {size}
            </button>
          ))}
        </div>

        {selectedMode === "ai" && (
          <>
            <h3 className="setup-subtitle">Your Mark</h3>
            <div className="setup-actions">
              <button
                className={`btn btn-light ${selectedPlayerMark === "X" ? "is-selected" : ""}`}
                onClick={() => setSelectedPlayerMark("X")}
              >
                Play as X
              </button>
              <button
                className={`btn btn-dark ${selectedPlayerMark === "O" ? "is-selected" : ""}`}
                onClick={() => setSelectedPlayerMark("O")}
              >
                Play as O
              </button>
            </div>

            <h3 className="setup-subtitle">Difficulty</h3>
            <div className="difficulty-actions">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option}
                  className={`btn btn-difficulty ${selectedDifficulty === option ? "is-selected" : ""}`}
                  onClick={() => setSelectedDifficulty(option)}
                >
                  {option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}

        {selectedMode === "friend" && (
          <div className="ttt-friend-box">
            <h3 className="setup-subtitle">Choose Friend</h3>
            <select
              value={selectedFriendId}
              onChange={(e) => setSelectedFriendId(e.target.value)}
              className="ttt-friend-select"
            >
              {friendCandidates.length === 0 ? (
                <option value="">No friends available</option>
              ) : (
                friendCandidates.map((friend) => (
                  <option key={friend.id} value={friend.id}>{friend.name}</option>
                ))
              )}
            </select>

            <div className="sudoku-actions">
              <button
                className="btn btn-dark"
                onClick={() => void sendFriendRequest()}
                disabled={!selectedFriendId || inviteSending || friendCandidates.length === 0}
              >
                {inviteSending ? "Sending Request..." : "Send Play Request"}
              </button>
              <button className="btn btn-light" onClick={() => navigate("/notifications")}>Open Notifications</button>
            </div>

            {inviteMessage && <div className="selection-hint">{inviteMessage}</div>}
          </div>
        )}

        <div className="sudoku-actions othello-settings-actions">
          <button className="btn btn-light" onClick={() => navigate("/")}>Back to Home</button>
          <button
            className="btn btn-start"
            disabled={!canStart}
            onClick={() => {
              navigate("/tictactoe/play", {
                state: {
                  mode: selectedMode,
                  difficulty: selectedDifficulty,
                  playerMark: selectedPlayerMark,
                  boardSize: selectedBoardSize,
                } satisfies TicTacToeRouteState,
              });
            }}
          >
            Start Game
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}
      </section>
    );
  }

  if (!gameStarted) {
    return (
      <section className="setup-card">
        <h2>Tic Tac Toe</h2>
        <p>{error || "Open settings to configure your game first."}</p>
        <div className="sudoku-actions">
          <button className="btn btn-start" onClick={() => navigate("/tictactoe/settings")}>Open Settings</button>
          <button className="btn btn-light" onClick={() => navigate("/notifications")}>Open Notifications</button>
        </div>
      </section>
    );
  }

  return (
    <section className="tictactoe-page setup-card">
      <div className="sudoku-header">
        <h2>Tic Tac Toe Arena</h2>
        <p>
          {isAiGame
            ? `Playing vs AI (${difficulty})`
            : isFriendGame
              ? "Playing with a friend"
              : "Local 2-player mode"}
          . Board: {boardSize} x {boardSize}.
        </p>
      </div>

      <div className="sudoku-topbar">
        <div className="sudoku-stats">
          <span>Mode: <strong>{isAiGame ? "vs AI" : isFriendGame ? "Friend Match" : "Local"}</strong></span>
          <span>You: <strong>{playerMark}</strong></span>
          <span>{isAiGame ? "AI" : "Opponent"}: <strong>{isAiGame ? aiMark : playerMark === "X" ? "O" : "X"}</strong></span>
          <span>Turn: <strong>{turnLabel}</strong></span>
          <span>Timer: <strong>{formatElapsed(elapsedSeconds)}</strong></span>
          <span>Moves: <strong>{moveHistory.length}</strong></span>
          <span>Status: <strong>{gameOver ? "Finished" : "In Progress"}</strong></span>
        </div>
      </div>

      <div className="ttt-grid" style={boardStyle} role="grid" aria-label="Tic Tac Toe board">
        {board.map((cell, idx) => (
          <button
            key={idx}
            className={`ttt-cell ${lastAiMoveIndex === idx ? "is-ai-last" : ""}`}
            style={{ fontSize: cellFontSize }}
            type="button"
            onClick={() => playAt(idx)}
            disabled={loadingMove || saving || gameOver || cell !== ""}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="sudoku-actions">
        {!isFriendGame && <button className="btn btn-start" onClick={startNewGame} disabled={loadingMove || saving}>New Game</button>}
        {!isFriendGame && <button className="btn btn-reset" onClick={() => void endTicTacToe()} disabled={loadingMove || saving || gameOver}>End Game</button>}
        {isFriendGame && friendMatchId && (
          <button className="btn btn-dark" onClick={() => void loadFriendMatch(friendMatchId)} disabled={loadingMove}>Refresh Match</button>
        )}
        <button className="btn btn-light" onClick={() => navigate("/tictactoe/settings")}>Change Settings</button>
        <button className="btn btn-light" onClick={() => navigate("/notifications")}>Notifications</button>
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
            <h2 id="ttt-result-title">
              {winner === "draw" ? "Draw" : winner === playerMark ? "You Won" : "You Lost"}
            </h2>
            <p>
              {winner === "draw"
                ? `Board filled in ${formatElapsed(elapsedSeconds)}.`
                : winner === playerMark
                  ? `You finished the game in ${moveHistory.length} moves and ${formatElapsed(elapsedSeconds)}.`
                  : `Opponent won in ${moveHistory.length} moves and ${formatElapsed(elapsedSeconds)}.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-light" onClick={() => setShowResultModal(false)}>Close</button>
              <button className="btn btn-light" onClick={() => navigate("/tictactoe/settings")}>Change Settings</button>
              <button className="btn btn-dark" onClick={onOpenHistory}>View History</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
