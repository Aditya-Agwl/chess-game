import { useEffect, useState } from "react";
import {
  cancelConnect4FriendInvite,
  ensureConnect4Realtime,
  fetchConnect4FriendInvites,
  respondConnect4FriendInvite,
  subscribeConnect4Realtime,
  type Connect4InvitesResponse,
} from "../../api/connect4";
import {
  cancelTicTacToeFriendInvite,
  ensureTicTacToeRealtime,
  fetchTicTacToeFriendInvites,
  respondTicTacToeFriendInvite,
  subscribeTicTacToeRealtime,
  type TicTacToeInvitesResponse,
} from "../../api/tictactoe";

type Props = {
  authToken: string;
  apiBase: string;
  onStartTicTacToeMatch: (matchId: string) => void;
  onStartConnect4Match: (matchId: string) => void;
  onIncomingCountChange?: (count: number) => void;
};

export default function NotificationsPage({
  authToken,
  apiBase,
  onStartTicTacToeMatch,
  onStartConnect4Match,
  onIncomingCountChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState("");
  const [tttInvites, setTttInvites] = useState<TicTacToeInvitesResponse | null>(null);
  const [c4Invites, setC4Invites] = useState<Connect4InvitesResponse | null>(null);
  const [expandedGame, setExpandedGame] = useState<"ttt" | "c4" | null>("ttt");

  async function loadInvites() {
    if (!authToken) return;
    setLoading(true);
    setError("");
    try {
      const [tttData, c4Data] = await Promise.all([
        fetchTicTacToeFriendInvites(apiBase, authToken),
        fetchConnect4FriendInvites(apiBase, authToken),
      ]);
      setTttInvites(tttData);
      setC4Invites(c4Data);
      onIncomingCountChange?.((tttData.incoming_count ?? 0) + (c4Data.incoming_count ?? 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "accept" }));
    try {
      const result = await respondTicTacToeFriendInvite(apiBase, authToken, inviteId, "accept");
      await loadInvites();
      if (result.match?.id) {
        onStartTicTacToeMatch(result.match.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  async function acceptConnect4Invite(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "accept-connect4" }));
    try {
      const result = await respondConnect4FriendInvite(apiBase, authToken, inviteId, "accept");
      await loadInvites();
      if (result.match?.id) {
        onStartConnect4Match(result.match.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  async function rejectInvite(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "reject" }));
    try {
      await respondTicTacToeFriendInvite(apiBase, authToken, inviteId, "reject");
      await loadInvites();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reject invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  async function cancelInvite(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "cancel" }));
    try {
      await cancelTicTacToeFriendInvite(apiBase, authToken, inviteId);
      await loadInvites();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not cancel invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  async function rejectConnect4Invite(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "reject-connect4" }));
    try {
      await respondConnect4FriendInvite(apiBase, authToken, inviteId, "reject");
      await loadInvites();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reject invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  async function cancelConnect4InviteAction(inviteId: string) {
    if (!authToken) return;
    setActionLoading((prev) => ({ ...prev, [inviteId]: "cancel-connect4" }));
    try {
      await cancelConnect4FriendInvite(apiBase, authToken, inviteId);
      await loadInvites();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not cancel invite");
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: undefined }));
    }
  }

  useEffect(() => {
    if (authToken) {
      ensureTicTacToeRealtime(apiBase, authToken);
      ensureConnect4Realtime(apiBase, authToken);
    }
    void loadInvites();
  }, [authToken, apiBase]);

  useEffect(() => {
    if (!authToken) return;

    const unsubTtt = subscribeTicTacToeRealtime((message) => {
      if (message.event === "ttt.invite.created" || message.event === "ttt.invite.updated") {
        void loadInvites();
      }
    });

    const unsubC4 = subscribeConnect4Realtime((message) => {
      if (message.event === "c4.invite.created" || message.event === "c4.invite.updated") {
        void loadInvites();
      }
    });

    return () => {
      unsubTtt();
      unsubC4();
    };
  }, [authToken, apiBase]);

  const tttIncoming = tttInvites?.incoming_pending ?? [];
  const tttOutgoing = tttInvites?.outgoing_pending ?? [];
  const tttAcceptedUpcoming = tttInvites?.accepted_matches_upcoming ?? tttInvites?.accepted_matches ?? [];
  const tttRequestCount = tttIncoming.length + tttOutgoing.length;

  const c4Incoming = c4Invites?.incoming_pending ?? [];
  const c4Outgoing = c4Invites?.outgoing_pending ?? [];
  const c4AcceptedUpcoming = c4Invites?.accepted_matches_upcoming ?? c4Invites?.accepted_matches ?? [];
  const c4RequestCount = c4Incoming.length + c4Outgoing.length;

  return (
    <section className="social-page friends-page">
      <div className="social-toolbar">
        <h2>Notifications</h2>
        <button className="btn btn-light" onClick={() => void loadInvites()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Tic Tac Toe Collapsible Section */}
      <div className="notification-game-section">
        <button
          className="notification-game-header"
          onClick={() => setExpandedGame(expandedGame === "ttt" ? null : "ttt")}
        >
          <span className="header-toggle">{expandedGame === "ttt" ? "▼" : "▶"}</span>
          <strong>Tic Tac Toe</strong>
          <span className="request-badge">{tttRequestCount}</span>
        </button>

        {expandedGame === "ttt" && (
          <div className="friends-columns">
            <article className="friends-column">
              <h3>Incoming Invites ({tttIncoming.length})</h3>
              {tttIncoming.length === 0 ? (
                <p className="history-empty">No incoming invites.</p>
              ) : (
                <div className="friends-list">
                  {tttIncoming.map((invite) => {
                    const state = actionLoading[invite.id];
                    return (
                      <div className="friend-row" key={invite.id}>
                        <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                        <small>{invite.board_size} x {invite.board_size} board</small>
                        <div className="friend-row-actions">
                          <button className="btn btn-dark" onClick={() => void acceptInvite(invite.id)} disabled={Boolean(state)}>
                            {state === "accept" ? "Accepting..." : "Accept"}
                          </button>
                          <button className="btn btn-light" onClick={() => void rejectInvite(invite.id)} disabled={Boolean(state)}>
                            {state === "reject" ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="friends-column">
              <h3>Outgoing Invites ({tttOutgoing.length})</h3>
              {tttOutgoing.length === 0 ? (
                <p className="history-empty">No outgoing invites.</p>
              ) : (
                <div className="friends-list">
                  {tttOutgoing.map((invite) => {
                    const state = actionLoading[invite.id];
                    return (
                      <div className="friend-row" key={invite.id}>
                        <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                        <small>{invite.board_size} x {invite.board_size} board</small>
                        <div className="friend-row-actions">
                          <button className="btn btn-light" onClick={() => void cancelInvite(invite.id)} disabled={Boolean(state)}>
                            {state === "cancel" ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="friends-column">
              <h3>Active Matches ({tttAcceptedUpcoming.length})</h3>
              {tttAcceptedUpcoming.length === 0 ? (
                <p className="history-empty">No active matches.</p>
              ) : (
                <div className="friends-list">
                  {tttAcceptedUpcoming.map((invite) => (
                    <div className="friend-row" key={invite.id}>
                      <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                      <small>Board {invite.board_size} x {invite.board_size}</small>
                      <div className="friend-row-actions">
                        <button
                          className="btn btn-dark"
                          disabled={!invite.match_id}
                          onClick={() => invite.match_id && onStartTicTacToeMatch(invite.match_id)}
                        >
                          Play Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        )}
      </div>

      {/* Connect 4 Collapsible Section */}
      <div className="notification-game-section">
        <button
          className="notification-game-header"
          onClick={() => setExpandedGame(expandedGame === "c4" ? null : "c4")}
        >
          <span className="header-toggle">{expandedGame === "c4" ? "▼" : "▶"}</span>
          <strong>Connect 4</strong>
          <span className="request-badge">{c4RequestCount}</span>
        </button>

        {expandedGame === "c4" && (
          <div className="friends-columns">
            <article className="friends-column">
              <h3>Incoming Invites ({c4Incoming.length})</h3>
              {c4Incoming.length === 0 ? (
                <p className="history-empty">No incoming invites.</p>
              ) : (
                <div className="friends-list">
                  {c4Incoming.map((invite) => {
                    const state = actionLoading[invite.id];
                    return (
                      <div className="friend-row" key={invite.id}>
                        <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                        <small>Connect 4 invite</small>
                        <div className="friend-row-actions">
                          <button className="btn btn-dark" onClick={() => void acceptConnect4Invite(invite.id)} disabled={Boolean(state)}>
                            {state === "accept-connect4" ? "Accepting..." : "Accept"}
                          </button>
                          <button className="btn btn-light" onClick={() => void rejectConnect4Invite(invite.id)} disabled={Boolean(state)}>
                            {state === "reject-connect4" ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="friends-column">
              <h3>Outgoing Invites ({c4Outgoing.length})</h3>
              {c4Outgoing.length === 0 ? (
                <p className="history-empty">No outgoing invites.</p>
              ) : (
                <div className="friends-list">
                  {c4Outgoing.map((invite) => {
                    const state = actionLoading[invite.id];
                    return (
                      <div className="friend-row" key={invite.id}>
                        <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                        <small>Connect 4 invite</small>
                        <div className="friend-row-actions">
                          <button className="btn btn-light" onClick={() => void cancelConnect4InviteAction(invite.id)} disabled={Boolean(state)}>
                            {state === "cancel-connect4" ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="friends-column">
              <h3>Active Matches ({c4AcceptedUpcoming.length})</h3>
              {c4AcceptedUpcoming.length === 0 ? (
                <p className="history-empty">No active matches.</p>
              ) : (
                <div className="friends-list">
                  {c4AcceptedUpcoming.map((invite) => (
                    <div className="friend-row" key={invite.id}>
                      <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                      <small>Connect 4 match</small>
                      <div className="friend-row-actions">
                        <button
                          className="btn btn-dark"
                          disabled={!invite.match_id}
                          onClick={() => invite.match_id && onStartConnect4Match(invite.match_id)}
                        >
                          Play Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
