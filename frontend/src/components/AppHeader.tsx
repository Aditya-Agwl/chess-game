import type { AuthUser } from "../types";

type Props = {
  user: AuthUser | null;
  showUserMenu: boolean;
  onToggleUserMenu: () => void;
  onGoHome: () => void;
  onGoHistory: () => void;
  onGoPlay: () => void;
  onGoSudoku: () => void;
  onGoTicTacToe: () => void;
  onGoConnectFour: () => void;
  onGoOthello: () => void;
  onLogout: () => void;
};

export default function AppHeader({
  user,
  showUserMenu,
  onToggleUserMenu,
  onGoHome,
  onGoHistory,
  onGoPlay,
  onGoSudoku,
  onGoTicTacToe,
  onGoConnectFour,
  onGoOthello,
  onLogout,
}: Props) {
  return (
    <header className="topbar">
      <div className="top-left">
        <div>
          <h1>The Royal Gambit</h1>
          <p>Play. Review. Improve.</p>
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
                <button className="user-menu-item" onClick={onGoHome}>Home</button>
                <button className="user-menu-item" onClick={onGoHistory}>Analyze Games</button>
                <button className="user-menu-item" onClick={onGoPlay}>Play Chess</button>
                <button className="user-menu-item" onClick={onGoSudoku}>Play Sudoku</button>
                <button className="user-menu-item" onClick={onGoTicTacToe}>Play Tic Tac Toe</button>
                <button className="user-menu-item" onClick={onGoConnectFour}>Play Connect 4</button>
                <button className="user-menu-item" onClick={onGoOthello}>Play Othello</button>
                <button className="btn btn-light" onClick={onLogout}>Sign Out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
