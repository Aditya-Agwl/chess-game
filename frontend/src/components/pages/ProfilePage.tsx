import type { AuthUser, ProfileSummary } from "../../types";

type Props = {
  user: AuthUser | null;
  profile: ProfileSummary | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpenUsers: () => void;
  onOpenFriends: () => void;
};

export default function ProfilePage({
  user,
  profile,
  loading,
  error,
  onRefresh,
  onOpenUsers,
  onOpenFriends,
}: Props) {
  return (
    <section className="social-page profile-page">
      <div className="social-toolbar">
        <h2>My Profile</h2>
        <button className="btn btn-light" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="profile-hero">
        <div className="profile-avatar-wrap" aria-hidden="true">
          {user?.picture ? <img src={user.picture} alt={user.name} /> : <span>{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</span>}
        </div>
        <div>
          <h3>{user?.name ?? "Player"}</h3>
          <p>{user?.email ?? "-"}</p>
          <p className="profile-joined">
            Joined: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "-"}
          </p>
        </div>
      </div>

      <div className="profile-stats-grid">
        <article className="social-stat-card">
          <strong>{profile?.friends_count ?? 0}</strong>
          <span>Friends</span>
        </article>
        <article className="social-stat-card">
          <strong>{profile?.incoming_requests_count ?? 0}</strong>
          <span>Incoming Requests</span>
        </article>
        <article className="social-stat-card">
          <strong>{profile?.outgoing_requests_count ?? 0}</strong>
          <span>Outgoing Requests</span>
        </article>
      </div>

      <div className="social-actions-row">
        <button className="btn btn-dark" onClick={onOpenUsers}>Find Users</button>
        <button className="btn btn-light" onClick={onOpenFriends}>Manage Friends</button>
      </div>
    </section>
  );
}
