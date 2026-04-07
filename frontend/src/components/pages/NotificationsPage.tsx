import { useEffect, useState } from "react";
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
  onStartMatch: (matchId: string) => void;
  onIncomingCountChange?: (count: number) => void;
};

export default function NotificationsPage({ authToken, apiBase, onStartMatch, onIncomingCountChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<TicTacToeInvitesResponse | null>(null);

  async function loadInvites() {
    if (!authToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchTicTacToeFriendInvites(apiBase, authToken);
      setInvites(data);
      onIncomingCountChange?.(data.incoming_count);
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
        onStartMatch(result.match.id);
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

  useEffect(() => {
    if (authToken) {
      ensureTicTacToeRealtime(apiBase, authToken);
    }
    void loadInvites();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    return subscribeTicTacToeRealtime((message) => {
      if (message.event === "ttt.invite.created" || message.event === "ttt.invite.updated") {
        void loadInvites();
      }
    });
  }, [authToken]);

  const incoming = invites?.incoming_pending ?? [];
  const outgoing = invites?.outgoing_pending ?? [];
  const acceptedUpcoming = invites?.accepted_matches_upcoming ?? invites?.accepted_matches ?? [];
  const acceptedCompleted = invites?.accepted_matches_completed ?? [];

  return (
    <section className="social-page friends-page">
      <div className="social-toolbar">
        <h2>Notifications</h2>
        <button className="btn btn-light" onClick={() => void loadInvites()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="friends-columns">
        <article className="friends-column">
          <h3>Incoming Game Invites ({incoming.length})</h3>
          {incoming.length === 0 ? (
            <p className="history-empty">No incoming Tic Tac Toe invites.</p>
          ) : (
            <div className="friends-list">
              {incoming.map((invite) => {
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
          <h3>Outgoing Game Invites ({outgoing.length})</h3>
          {outgoing.length === 0 ? (
            <p className="history-empty">No outgoing Tic Tac Toe invites.</p>
          ) : (
            <div className="friends-list">
              {outgoing.map((invite) => {
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
          <h3>Accepted Matches ({acceptedUpcoming.length})</h3>
          {acceptedUpcoming.length === 0 ? (
            <p className="history-empty">No upcoming accepted matches.</p>
          ) : (
            <div className="friends-list">
              {acceptedUpcoming.map((invite) => (
                <div className="friend-row" key={invite.id}>
                  <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                  <small>Board {invite.board_size} x {invite.board_size}</small>
                  <div className="friend-row-actions">
                    <button
                      className="btn btn-dark"
                      disabled={!invite.match_id}
                      onClick={() => invite.match_id && onStartMatch(invite.match_id)}
                    >
                      Play Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="friends-column">
          <h3>Completed Matches ({acceptedCompleted.length})</h3>
          {acceptedCompleted.length === 0 ? (
            <p className="history-empty">No completed matches yet.</p>
          ) : (
            <div className="friends-list">
              {acceptedCompleted.map((invite) => (
                <div className="friend-row" key={invite.id}>
                  <span>{invite.counterpart?.name ?? "Unknown player"}</span>
                  <small>Board {invite.board_size} x {invite.board_size}</small>
                  <div className="friend-row-actions">
                    <button
                      className="btn btn-light"
                      disabled={!invite.match_id}
                      onClick={() => invite.match_id && onStartMatch(invite.match_id)}
                    >
                      View Match
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
