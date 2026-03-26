import type { DifficultyLevel, GameResult, PlayerColor, SavedGame } from "../../types";

type Props = {
  gamesLoading: boolean;
  gamesError: string;
  filteredGames: SavedGame[];
  selectedGame: SavedGame | null;
  filterResult: "all" | GameResult;
  filterDifficulty: "all" | DifficultyLevel;
  filterColor: "all" | PlayerColor;
  searchText: string;
  resultLabel: (result: GameResult) => string;
  formatDate: (value?: string) => string;
  movePairs: (moves: string[]) => string[];
  toLabel: (value: string) => string;
  onRefresh: () => void;
  onPlayNow: () => void;
  onSetFilterResult: (value: "all" | GameResult) => void;
  onSetFilterDifficulty: (value: "all" | DifficultyLevel) => void;
  onSetFilterColor: (value: "all" | PlayerColor) => void;
  onSetSearchText: (value: string) => void;
  onSelectGame: (id: string) => void;
};

export default function HistoryPage({
  gamesLoading,
  gamesError,
  filteredGames,
  selectedGame,
  filterResult,
  filterDifficulty,
  filterColor,
  searchText,
  resultLabel,
  formatDate,
  movePairs,
  toLabel,
  onRefresh,
  onPlayNow,
  onSetFilterResult,
  onSetFilterDifficulty,
  onSetFilterColor,
  onSetSearchText,
  onSelectGame,
}: Props) {
  return (
    <section className="history-page">
      <div className="history-toolbar">
        <h2>Recent Games</h2>
        <div className="history-actions">
          <button className="btn btn-light" onClick={onRefresh} disabled={gamesLoading}>
            {gamesLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-dark" onClick={onPlayNow}>Play Now</button>
        </div>
      </div>

      <div className="history-filters">
        <label>
          Result
          <select value={filterResult} onChange={(e) => onSetFilterResult(e.target.value as "all" | GameResult)}>
            <option value="all">All</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="draw">Draw</option>
            <option value="aborted">Aborted</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={filterDifficulty} onChange={(e) => onSetFilterDifficulty(e.target.value as "all" | DifficultyLevel)}>
            <option value="all">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Side
          <select value={filterColor} onChange={(e) => onSetFilterColor(e.target.value as "all" | PlayerColor)}>
            <option value="all">All</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <label className="search-field">
          Search
          <input
            value={searchText}
            onChange={(e) => onSetSearchText(e.target.value)}
            placeholder="Result, date, difficulty, side..."
          />
        </label>
      </div>

      {gamesError && <div className="error-box">{gamesError}</div>}

      <div className="history-layout">
        <div className="history-list-panel">
          {gamesLoading ? (
            <p className="history-empty">Loading games...</p>
          ) : filteredGames.length === 0 ? (
            <p className="history-empty">No games match your filters yet.</p>
          ) : (
            <div className="history-list">
              {filteredGames.map((g) => (
                <button
                  className={`history-card ${selectedGame?.id === g.id ? "is-active" : ""}`}
                  key={g.id}
                  onClick={() => onSelectGame(g.id)}
                >
                  <div className="history-topline">
                    <span className={`result-pill result-${g.result}`}>{resultLabel(g.result)}</span>
                    <span>{formatDate(g.finished_at)}</span>
                  </div>
                  <div className="history-meta">
                    <span>Difficulty: <strong>{toLabel(g.difficulty)}</strong></span>
                    <span>Side: <strong>{toLabel(g.player_color)}</strong></span>
                    <span>Moves: <strong>{g.move_history?.length ?? 0}</strong></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="history-detail-panel">
          {selectedGame ? (
            <>
              <h3>Move Sequence</h3>
              <div className="history-summary">
                <span className={`result-pill result-${selectedGame.result}`}>{resultLabel(selectedGame.result)}</span>
                <span>{formatDate(selectedGame.finished_at)}</span>
              </div>
              <div className="move-lines">
                {movePairs(selectedGame.move_history ?? []).map((line, idx) => (
                  <div className="move-line" key={`${selectedGame.id}-${idx}`}>{line}</div>
                ))}
              </div>
              {selectedGame.pgn && (
                <div className="fen-block">
                  <span>PGN</span>
                  <code>{selectedGame.pgn}</code>
                </div>
              )}
              {selectedGame.final_fen && (
                <div className="fen-block">
                  <span>Final FEN</span>
                  <code>{selectedGame.final_fen}</code>
                </div>
              )}
            </>
          ) : (
            <p className="history-empty">Select a game to inspect moves.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
