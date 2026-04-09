import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import {
  ensureConnect4Realtime,
  fetchConnect4BestMove,
  fetchConnect4FriendMatch,
  fetchFriendsForConnect4Invite,
  playConnect4FriendMove,
  saveConnect4Game,
  sendConnect4FriendInvite,
  sendConnect4RealtimeMessage,
  subscribeConnect4Realtime,
  type Connect4FriendMatch,
  type Connect4Mode,
} from "../../api/connect4";
import type { DifficultyLevel, GameResult, SocialUser } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
  routeMode: "settings" | "play";
};

type Connect4RouteState = {
  mode: Connect4Mode;
  difficulty: DifficultyLevel;
  playerDisc: Connect4Disc;
  matchId?: string;
};

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

function boardFromString(board: string): (Connect4Disc | "")[][] {
  if (board.length !== CONNECT4_ROWS * CONNECT4_COLS) {
    return createConnect4Board();
  }

  const cells = board.split("").map((cell) => (cell === "-" ? "" : (cell as Connect4Disc)));
  const rows: (Connect4Disc | "")[][] = [];
  for (let row = 0; row < CONNECT4_ROWS; row += 1) {
    rows.push(cells.slice(row * CONNECT4_COLS, (row + 1) * CONNECT4_COLS));
  }
  return rows;
}

export default function ConnectFourPage({ authToken, apiBase, onOpenHistory, routeMode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedMode, setSelectedMode] = useState<Connect4Mode>("ai");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("medium");
  const [selectedPlayerDisc, setSelectedPlayerDisc] = useState<Connect4Disc>("R");

  const [friendCandidates, setFriendCandidates] = useState<SocialUser[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const [gameMode, setGameMode] = useState<Connect4Mode>("ai");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [playerDisc, setPlayerDisc] = useState<Connect4Disc>("R");
  const [friendMatchId, setFriendMatchId] = useState<string | null>(null);
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
  const isFriendGame = gameMode === "friend";
  const isPlayerTurn = currentPlayer === playerDisc;
  const aiDisc: Connect4Disc = playerDisc === "R" ? "Y" : "R";
  const canDropDisc = !gameOver && !loadingAi && (isAiGame || isFriendGame ? isPlayerTurn : true);
  
  const status = useMemo(() => {
    if (!gameStarted) return "Open Connect 4 settings and start a game.";
    if (winner === "draw") return "Draw game. Board is full.";
    if (winner === "R" || winner === "Y") {
      const isPlayerWinner = winner === playerDisc;
      if (isFriendGame) {
        return winner === playerDisc ? "You win!" : "Your friend wins.";
      }
      return isPlayerWinner ? "You win!" : `${labelForDisc(winner)} wins!`;
    }
    if (isAiGame && loadingAi) return "AI is thinking...";
    if (isFriendGame) {
      return isPlayerTurn ? "Your turn." : "Waiting for your friend...";
    }
    return `${labelForDisc(currentPlayer)}'s turn.`;
  }, [winner, currentPlayer, gameMode, loadingAi, playerDisc, gameStarted, isFriendGame, isPlayerTurn, isAiGame]);

  function applyFriendMatch(match: Connect4FriendMatch, showModalOnFinish = false) {
    setGameMode("friend");
    setGameStarted(true);
    setDifficulty("medium");
    setPlayerDisc(match.my_disc);
    setFriendMatchId(match.id);
    setBoard(boardFromString(match.board));
    setCurrentPlayer(match.current_turn);
    setMoveHistory(match.move_history ?? []);
    setWinner(match.winner ?? null);
    setShowResultModal(showModalOnFinish && match.status === "finished");
    setError("");

    let foundLastMove: { row: number; column: number } | null = null;
    const boardState = boardFromString(match.board);
    for (let row = 0; row < CONNECT4_ROWS; row += 1) {
      for (let column = 0; column < CONNECT4_COLS; column += 1) {
        if (boardState[row][column] !== "") {
          foundLastMove = { row, column };
        }
      }
    }
    setLastMove(foundLastMove);

    if (match.created_at) {
      setStartedAt(match.created_at);
    }
  }

  async function loadFriendMatch(matchId: string, showModalOnFinish = false) {
    if (!authToken) return;
    try {
      const match = await fetchConnect4FriendMatch(apiBase, authToken, matchId);
      applyFriendMatch(match, showModalOnFinish);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load friend match");
    }
  }

  async function saveConnect4IfNeeded(forcedWinner?: Connect4Winner) {
    if (!authToken || saved || isFriendGame || !gameStarted) return;

    setSaving(true);
    try {
      const resolvedWinner = forcedWinner ?? winner;
      let result: GameResult = "aborted";
      if (resolvedWinner === "draw") {
        result = "draw";
      } else if (resolvedWinner) {
        result = resolvedWinner === playerDisc ? "win" : "loss";
      }

      await saveConnect4Game(apiBase, authToken, {
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
      });

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Connect 4 game");
    } finally {
      setSaving(false);
    }
  }

  function launchGame(config: Connect4RouteState) {
    const freshBoard = createConnect4Board();

    setGameMode(config.mode);
    setDifficulty(config.difficulty);
    setPlayerDisc(config.playerDisc);
    setFriendMatchId(config.matchId ?? null);

    setBoard(freshBoard);
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

    if (config.mode === "ai" && config.playerDisc !== "R") {
      window.setTimeout(() => {
        void requestAiMove(freshBoard, [], "R", config.difficulty, config.playerDisc);
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
      playerDisc,
      matchId: friendMatchId ?? undefined,
    });
  }

  async function endConnect4() {
    if (gameOver || isFriendGame) return;
    await saveConnect4IfNeeded();
  }

  async function sendFriendRequest() {
    if (!authToken || !selectedFriendId) return;

    setInviteSending(true);
    setInviteMessage("");
    setError("");
    try {
      const result = await sendConnect4FriendInvite(apiBase, authToken, selectedFriendId);
      setInviteMessage(result.detail || "Request sent.");
      navigate("/notifications");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send game invite");
    } finally {
      setInviteSending(false);
    }
  }

  async function playFriendColumn(column: number) {
    if (!authToken || !friendMatchId) return;

    const sent = sendConnect4RealtimeMessage({
      type: "c4_friend_move",
      match_id: friendMatchId,
      column,
    });

    if (sent) {
      setLoadingAi(true);
      window.setTimeout(() => {
        setLoadingAi(false);
      }, 2200);
      return;
    }

    setLoadingAi(true);
    setError("");
    try {
      const match = await playConnect4FriendMove(apiBase, authToken, friendMatchId, column);
      applyFriendMatch(match, true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit move");
    } finally {
      setLoadingAi(false);
    }
  }

  async function requestAiMove(
    nextBoard: (Connect4Disc | "")[][],
    history: string[],
    aiTurn: Connect4Disc,
    currentDifficulty = difficulty,
    currentPlayerDisc = playerDisc,
  ) {
    if (isFriendGame) return;

    setLoadingAi(true);
    setError("");
    try {
      const data = await fetchConnect4BestMove(apiBase, {
        board: boardToString(nextBoard),
        difficulty: currentDifficulty,
        ai_disc: aiTurn,
      });

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

      setCurrentPlayer(currentPlayerDisc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch AI move");
    } finally {
      setLoadingAi(false);
    }
  }

  function playColumn(column: number) {
    if (gameOver || loadingAi) return;
    if (isFriendGame) {
      if (!isPlayerTurn) return;
      void playFriendColumn(column);
      return;
    }

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
    if (routeMode !== "settings" || selectedMode !== "friend" || !authToken) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const friends = await fetchFriendsForConnect4Invite(apiBase, authToken);
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
  }, [routeMode, selectedMode, authToken, apiBase]);

  useEffect(() => {
    if (authToken) {
      ensureConnect4Realtime(apiBase, authToken);
    }

    if (!authToken) return;

    return subscribeConnect4Realtime((message) => {
      if (message.event === "realtime.connected" && friendMatchId) {
        sendConnect4RealtimeMessage({
          type: "subscribe_connect4_match",
          match_id: friendMatchId,
        });
      }

      if (message.event === "c4.match.updated") {
        const payloadMatchId = String(message.payload.match_id ?? "");
        if (payloadMatchId && friendMatchId && payloadMatchId === friendMatchId) {
          setLoadingAi(false);
          void loadFriendMatch(payloadMatchId, true);
        }
      }
    });
  }, [authToken, apiBase, friendMatchId]);

  useEffect(() => {
    if (!isFriendGame || !friendMatchId) return;

    sendConnect4RealtimeMessage({
      type: "subscribe_connect4_match",
      match_id: friendMatchId,
    });

    return () => {
      sendConnect4RealtimeMessage({
        type: "unsubscribe_connect4_match",
        match_id: friendMatchId,
      });
    };
  }, [isFriendGame, friendMatchId]);

  useEffect(() => {
    if (routeMode !== "play") return;

    const state = (location.state as Connect4RouteState | null) ?? null;
    if (!state) {
      setError("Open Connect 4 settings first, then start a game.");
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
        ? Boolean(selectedDifficulty && selectedPlayerDisc)
        : selectedMode === "friend"
          ? false
          : true;

    return (
      <section className="setup-card othello-settings-card c4-settings-card">
        <div className="othello-settings-head">
          <h2>Connect 4 Setup</h2>
          <span className="othello-step-pill">Match Builder</span>
        </div>
        <p>Pick your mode and options before launching the board.</p>

        <h3 className="setup-subtitle">Game Mode</h3>
        <div className="othello-mode-grid ttt-mode-grid" role="group" aria-label="Connect 4 mode selection">
          <button
            className={`othello-mode-card ${selectedMode === "local" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("local");
              setError("");
            }}
          >
            <strong>Local 2-Player</strong>
            <span>Share one board and alternate turns on this device.</span>
          </button>
          <button
            className={`othello-mode-card is-ai ${selectedMode === "ai" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("ai");
              setError("");
            }}
          >
            <strong>Play vs AI</strong>
            <span>Practice opening traps and tactical drops against the engine.</span>
          </button>
          <button
            className={`othello-mode-card ${selectedMode === "friend" ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedMode("friend");
              setError("");
            }}
          >
            <strong>Play a Friend</strong>
            <span>Send an invite and continue your shared match live.</span>
          </button>
        </div>

        {selectedMode === "ai" && (
          <>
            <h3 className="setup-subtitle">Your Disc</h3>
            <div className="setup-actions">
              <button
                className={`btn btn-light ${selectedPlayerDisc === "R" ? "is-selected" : ""}`}
                onClick={() => setSelectedPlayerDisc("R")}
              >
                Play as Red
              </button>
              <button
                className={`btn btn-dark ${selectedPlayerDisc === "Y" ? "is-selected" : ""}`}
                onClick={() => setSelectedPlayerDisc("Y")}
              >
                Play as Yellow
              </button>
            </div>

            <h3 className="setup-subtitle">Difficulty</h3>
            <div className="difficulty-actions">
              {(["easy", "medium", "hard"] as const).map((option) => (
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
          <div className="ttt-friend-box c4-friend-box">
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
              navigate("/connect4/play", {
                state: {
                  mode: selectedMode,
                  difficulty: selectedDifficulty,
                  playerDisc: selectedPlayerDisc,
                } satisfies Connect4RouteState,
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
        <h2>Connect 4</h2>
        <p>{error || "Open settings to configure your game first."}</p>
        <div className="sudoku-actions">
          <button className="btn btn-start" onClick={() => navigate("/connect4/settings")}>Open Settings</button>
          <button className="btn btn-light" onClick={() => navigate("/notifications")}>Open Notifications</button>
        </div>
      </section>
    );
  }


  return (
    <section className="connect4-page setup-card c4-play-card">
      <div className="sudoku-header">
        <h2>Connect 4 Arena</h2>
        <p>
          {isAiGame
            ? `Playing vs AI (${difficulty})`
            : isFriendGame
              ? "Playing with a friend"
              : "Local 2-player mode"}
          . Drop discs and connect four to win.
        </p>
      </div>

      <div className="sudoku-stats">
        <span>Mode: <strong>{isAiGame ? "vs AI" : isFriendGame ? "Friend Match" : "Local"}</strong></span>
        <span>You: <strong>{labelForDisc(playerDisc)}</strong></span>
        <span>{isAiGame ? "AI" : "Opponent"}: <strong>{labelForDisc(aiDisc)}</strong></span>
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
              disabled={!canDropDisc}
              aria-label={`Drop in column ${column + 1}`}
            >
              {column + 1}
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
                  disabled={!canDropDisc}
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
        {!isFriendGame && <button className="btn btn-start" onClick={startNewGame} disabled={loadingAi || saving}>
          New Game
        </button>}
        {!isFriendGame && <button className="btn btn-reset" onClick={() => void endConnect4()} disabled={loadingAi || saving || gameOver}>
          End Game
        </button>}
        {isFriendGame && friendMatchId && (
          <button className="btn btn-dark" onClick={() => void loadFriendMatch(friendMatchId)} disabled={loadingAi}>Refresh Match</button>
        )}
        <button className="btn btn-light" onClick={() => navigate("/connect4/settings")}>Change Settings</button>
        <button className="btn btn-light" onClick={() => navigate("/notifications")}>Notifications</button>
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
              {!isFriendGame && <button className="btn btn-start" onClick={startNewGame}>Play Again</button>}
              {isFriendGame && <button className="btn btn-light" onClick={() => setShowResultModal(false)}>Close</button>}
              <button className="btn btn-light" onClick={() => navigate("/connect4/settings")}>Change Settings</button>
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
