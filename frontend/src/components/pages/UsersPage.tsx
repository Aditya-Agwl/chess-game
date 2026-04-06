import type { FriendActionType, SocialUser } from "../../types";

type Props = {
  users: SocialUser[];
  searchText: string;
  loading: boolean;
  error: string;
  actionLoadingById: Record<string, FriendActionType | undefined>;
  onChangeSearchText: (value: string) => void;
  onSearch: () => void;
  onAddFriend: (userId: string) => void;
  onAcceptRequest: (userId: string) => void;
  onRejectRequest: (userId: string) => void;
  onCancelRequest: (userId: string) => void;
  onUnfriend: (user: SocialUser) => void;
};

function relationLabel(relation: SocialUser["relation"]): string {
  if (relation === "friend") return "Friend";
  if (relation === "incoming_request") return "Requested You";
  if (relation === "outgoing_request") return "Request Sent";
  return "Not Connected";
}

export default function UsersPage({
  users,
  searchText,
  loading,
  error,
  actionLoadingById,
  onChangeSearchText,
  onSearch,
  onAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onUnfriend,
}: Props) {
  return (
    <section className="social-page users-page">
      <div className="social-toolbar users-toolbar">
        <h2>Find Players</h2>
        <div className="users-search">
          <input
            value={searchText}
            onChange={(e) => onChangeSearchText(e.target.value)}
            placeholder="Search by name or email"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSearch();
              }
            }}
          />
          <button className="btn btn-dark" onClick={onSearch} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="social-list">
        {users.length === 0 ? (
          <p className="history-empty">No users found. Try a different search.</p>
        ) : (
          users.map((item) => {
            const actionLoading = actionLoadingById[item.id];
            return (
              <article className="social-user-card" key={item.id}>
                <div className="social-user-main">
                  <div className="social-avatar" aria-hidden="true">
                    {item.picture ? <img src={item.picture} alt={item.name} /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.email}</p>
                    <span className={`relation-pill relation-${item.relation}`}>{relationLabel(item.relation)}</span>
                  </div>
                </div>

                <div className="social-user-actions">
                  {item.relation === "none" && (
                    <button
                      className="btn btn-dark"
                      onClick={() => onAddFriend(item.id)}
                      disabled={Boolean(actionLoading)}
                    >
                      {actionLoading === "add" ? "Sending..." : "Add Friend"}
                    </button>
                  )}

                  {item.relation === "outgoing_request" && (
                    <button
                      className="btn btn-light"
                      onClick={() => onCancelRequest(item.id)}
                      disabled={Boolean(actionLoading)}
                    >
                      {actionLoading === "cancel" ? "Cancelling..." : "Cancel Request"}
                    </button>
                  )}

                  {item.relation === "friend" && (
                    <button
                      className="btn btn-light"
                      onClick={() => onUnfriend(item)}
                      disabled={Boolean(actionLoading)}
                    >
                      {actionLoading === "unfriend" ? "Removing..." : "Unfriend"}
                    </button>
                  )}

                  {item.relation === "incoming_request" && (
                    <>
                      <button
                        className="btn btn-dark"
                        onClick={() => onAcceptRequest(item.id)}
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "accept" ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        className="btn btn-light"
                        onClick={() => onRejectRequest(item.id)}
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "reject" ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
