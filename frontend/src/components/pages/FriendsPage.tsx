import type { FriendActionType, SocialOverview, SocialUser } from "../../types";

type Props = {
  overview: SocialOverview | null;
  loading: boolean;
  error: string;
  actionLoadingById: Record<string, FriendActionType | undefined>;
  onRefresh: () => void;
  onAcceptRequest: (userId: string) => void;
  onRejectRequest: (userId: string) => void;
  onCancelRequest: (userId: string) => void;
  onUnfriend: (user: SocialUser) => void;
};

export default function FriendsPage({
  overview,
  loading,
  error,
  actionLoadingById,
  onRefresh,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onUnfriend,
}: Props) {
  const friends = overview?.friends ?? [];
  const incoming = overview?.incoming_requests ?? [];
  const outgoing = overview?.outgoing_requests ?? [];

  return (
    <section className="social-page friends-page">
      <div className="social-toolbar">
        <h2>Friends & Requests</h2>
        <button className="btn btn-light" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="friends-columns">
        <article className="friends-column">
          <h3>Friends ({friends.length})</h3>
          {friends.length === 0 ? (
            <p className="history-empty">No friends yet. Start by searching users.</p>
          ) : (
            <div className="friends-list">
              {friends.map((item) => (
                <div className="friend-row" key={item.id}>
                  <span>{item.name}</span>
                  <small>{item.email}</small>
                  <div className="friend-row-actions">
                    <button className="btn btn-light" onClick={() => onUnfriend(item)} disabled={Boolean(actionLoadingById[item.id])}>
                      {actionLoadingById[item.id] === "unfriend" ? "Removing..." : "Unfriend"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="friends-column">
          <h3>Incoming ({incoming.length})</h3>
          {incoming.length === 0 ? (
            <p className="history-empty">No incoming requests.</p>
          ) : (
            <div className="friends-list">
              {incoming.map((item) => {
                const state = actionLoadingById[item.id];
                return (
                  <div className="friend-row" key={item.id}>
                    <span>{item.name}</span>
                    <small>{item.email}</small>
                    <div className="friend-row-actions">
                      <button className="btn btn-dark" onClick={() => onAcceptRequest(item.id)} disabled={Boolean(state)}>
                        {state === "accept" ? "Accepting..." : "Accept"}
                      </button>
                      <button className="btn btn-light" onClick={() => onRejectRequest(item.id)} disabled={Boolean(state)}>
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
          <h3>Outgoing ({outgoing.length})</h3>
          {outgoing.length === 0 ? (
            <p className="history-empty">No outgoing requests.</p>
          ) : (
            <div className="friends-list">
              {outgoing.map((item) => {
                const state = actionLoadingById[item.id];
                return (
                  <div className="friend-row" key={item.id}>
                    <span>{item.name}</span>
                    <small>{item.email}</small>
                    <div className="friend-row-actions">
                      <button className="btn btn-light" onClick={() => onCancelRequest(item.id)} disabled={Boolean(state)}>
                        {state === "cancel" ? "Cancelling..." : "Cancel"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
