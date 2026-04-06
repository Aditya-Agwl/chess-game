import type { AuthUser } from "../types";

type Props = {
  user: AuthUser | null;
  showUserMenu: boolean;
  onToggleUserMenu: () => void;
  onGoProfile: () => void;
  onGoUsers: () => void;
  onGoFriends: () => void;
  onGoHome: () => void;
  onGoHistory: () => void;
  onLogout: () => void;
};

export default function AppHeader({
  user,
  showUserMenu,
  onToggleUserMenu,
  onGoProfile,
  onGoUsers,
  onGoFriends,
  onGoHome,
  onGoHistory,
  onLogout,
}: Props) {
  return (
    <header className="topbar">
      <div className="top-left">
        <div>
          <h1>The Boardroom</h1>
        </div>
      </div>

      <div className="top-right">
        {user && (
          <div className="user-chip-wrap">
            <button
              className="user-chip"
              title={user.name}
              onClick={onToggleUserMenu}
              aria-label="User menu"
            >
              {user.picture ? (
                <img src={user.picture} alt="User" />
              ) : (
                user.name.slice(0, 1).toUpperCase()
              )}
            </button>
            {showUserMenu && (
              <div className="user-menu">
                <div className="user-menu-profile">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <button className="user-menu-item" onClick={onGoProfile}>My Profile</button>
                <button className="user-menu-item" onClick={onGoUsers}>Find Users</button>
                <button className="user-menu-item" onClick={onGoFriends}>Friends & Requests</button>
                <button className="user-menu-item" onClick={onGoHome}>Home</button>
                <button className="user-menu-item" onClick={onGoHistory}>Analyze Games</button>
                <button className="btn btn-light" onClick={onLogout}>Sign Out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
