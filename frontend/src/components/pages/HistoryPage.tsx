import type { DifficultyLevel, GameResult, GameType, PlayerColor, SavedGame } from "../../types";

type Props = {
  gamesLoading: boolean;
  gamesError: string;
  filteredGames: SavedGame[];
  selectedGame: SavedGame | null;
  filterGameType: "all" | GameType;
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
  onSetFilterGameType: (value: "all" | GameType) => void;
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
  filterGameType,
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
  onSetFilterGameType,
  onSetFilterResult,
  onSetFilterDifficulty,
  onSetFilterColor,
  onSetSearchText,
  onSelectGame,
}: Props) {
  function toSudokuRows(grid?: string): string[] | null {
    if (!grid || grid.length !== 81) return null;
    const safe = grid.replace(/[^0-9]/g, "");
    if (safe.length !== 81) return null;
    const rows: string[] = [];
    for (let i = 0; i < 81; i += 9) {
      rows.push(safe.slice(i, i + 9));
    }
    return rows;
  }

  const selectedType = selectedGame?.game_type ?? "chess";
  const sudokuPuzzleRows = selectedType === "sudoku" ? toSudokuRows(selectedGame?.sudoku_puzzle) : null;
  const sudokuUserRows = selectedType === "sudoku" ? toSudokuRows(selectedGame?.sudoku_user_grid) : null;
  const tttCells = selectedType === "tictactoe" ? (selectedGame?.tictactoe_board ?? "").split("") : [];
  const connect4Cells = selectedType === "connect4" ? (selectedGame?.connect4_board ?? "").split("") : [];
  const othelloCells = selectedType === "othello" ? (selectedGame?.othello_board ?? "").split("") : [];

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
          Game
          <select value={filterGameType} onChange={(e) => onSetFilterGameType(e.target.value as "all" | GameType)}>
            <option value="all">All</option>
            <option value="chess">Chess</option>
            <option value="sudoku">Sudoku</option>
            <option value="tictactoe">Tic Tac Toe</option>
            <option value="connect4">Connect 4</option>
            <option value="othello">Othello</option>
          </select>
        </label>
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
                    <span>Game: <strong>{toLabel(g.game_type ?? "chess")}</strong></span>
                    <span>Difficulty: <strong>{toLabel(g.difficulty)}</strong></span>
                    {(g.game_type ?? "chess") === "chess" ? (
                      <>
                        <span>Side: <strong>{g.player_color ? toLabel(g.player_color) : "-"}</strong></span>
                        <span>Time: <strong>{g.time_control ?? "-"}</strong></span>
                        <span>Moves: <strong>{g.move_history?.length ?? 0}</strong></span>
                      </>
                    ) : (g.game_type ?? "chess") === "sudoku" ? (
                      <>
                        <span>Duration: <strong>{g.sudoku_elapsed_seconds !== undefined ? `${g.sudoku_elapsed_seconds}s` : "-"}</strong></span>
                        <span>Mistakes: <strong>{g.sudoku_mistakes ?? "-"}</strong></span>
                      </>
                    ) : (g.game_type ?? "chess") === "tictactoe" ? (
                      <>
                        <span>Side: <strong>{g.tictactoe_player_mark ?? "-"}</strong></span>
                        <span>Duration: <strong>{g.tictactoe_elapsed_seconds !== undefined ? `${g.tictactoe_elapsed_seconds}s` : "-"}</strong></span>
                        <span>Winner: <strong>{g.tictactoe_winner ?? "-"}</strong></span>
                        <span>Moves: <strong>{g.tictactoe_move_history?.length ?? 0}</strong></span>
                      </>
                    ) : (g.game_type ?? "chess") === "connect4" ? (
                      <>
                        <span>Duration: <strong>{g.connect4_elapsed_seconds !== undefined ? `${g.connect4_elapsed_seconds}s` : "-"}</strong></span>
                        <span>Winner: <strong>{g.connect4_winner ?? "-"}</strong></span>
                        <span>Moves: <strong>{g.connect4_move_history?.length ?? 0}</strong></span>
                      </>
                    ) : (
                      <>
                        <span>Duration: <strong>{g.othello_elapsed_seconds !== undefined ? `${g.othello_elapsed_seconds}s` : "-"}</strong></span>
                        <span>Winner: <strong>{g.othello_winner ?? "-"}</strong></span>
                        <span>Moves: <strong>{g.othello_move_history?.length ?? 0}</strong></span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="history-detail-panel">
          {selectedGame ? (
            <>
              <h3>
                {selectedType === "chess"
                  ? "Move Sequence"
                  : selectedType === "sudoku"
                    ? "Sudoku Summary"
                    : selectedType === "tictactoe"
                      ? "Tic Tac Toe Summary"
                      : selectedType === "connect4"
                        ? "Connect 4 Summary"
                        : "Othello Summary"}
              </h3>
              <div className="history-summary">
                <span className={`result-pill result-${selectedGame.result}`}>{resultLabel(selectedGame.result)}</span>
                <span>{formatDate(selectedGame.finished_at)}</span>
              </div>
              <div className="history-meta">
                <span>Game: <strong>{toLabel(selectedType)}</strong></span>
                {selectedType === "chess" ? (
                  <>
                    <span>Side: <strong>{selectedGame.player_color ? toLabel(selectedGame.player_color) : "-"}</strong></span>
                    <span>Difficulty: <strong>{toLabel(selectedGame.difficulty)}</strong></span>
                    <span>Time Control: <strong>{selectedGame.time_control ?? "-"}</strong></span>
                    <span>Clock Left: <strong>
                      {selectedGame.white_time_left_ms !== undefined && selectedGame.black_time_left_ms !== undefined
                        ? `${Math.max(0, Math.ceil(selectedGame.white_time_left_ms / 1000))}s / ${Math.max(0, Math.ceil(selectedGame.black_time_left_ms / 1000))}s`
                        : "-"}
                    </strong></span>
                  </>
                ) : selectedType === "sudoku" ? (
                  <>
                    <span>Difficulty: <strong>{toLabel(selectedGame.difficulty)}</strong></span>
                    <span>Sudoku Time: <strong>{selectedGame.sudoku_elapsed_seconds !== undefined ? `${selectedGame.sudoku_elapsed_seconds}s` : "-"}</strong></span>
                    <span>Sudoku Mistakes: <strong>{selectedGame.sudoku_mistakes ?? "-"}</strong></span>
                  </>
                ) : selectedType === "tictactoe" ? (
                  <>
                    <span>Difficulty: <strong>{toLabel(selectedGame.difficulty)}</strong></span>
                    <span>Side: <strong>{selectedGame.tictactoe_player_mark ?? "-"}</strong></span>
                    <span>Tic Tac Toe Time: <strong>{selectedGame.tictactoe_elapsed_seconds !== undefined ? `${selectedGame.tictactoe_elapsed_seconds}s` : "-"}</strong></span>
                    <span>Winner: <strong>{selectedGame.tictactoe_winner ?? "-"}</strong></span>
                  </>
                ) : selectedType === "connect4" ? (
                  <>
                    <span>Difficulty: <strong>{toLabel(selectedGame.difficulty)}</strong></span>
                    <span>Connect 4 Time: <strong>{selectedGame.connect4_elapsed_seconds !== undefined ? `${selectedGame.connect4_elapsed_seconds}s` : "-"}</strong></span>
                    <span>Winner: <strong>{selectedGame.connect4_winner ?? "-"}</strong></span>
                  </>
                ) : (
                  <>
                    <span>Difficulty: <strong>{toLabel(selectedGame.difficulty)}</strong></span>
                    <span>Othello Time: <strong>{selectedGame.othello_elapsed_seconds !== undefined ? `${selectedGame.othello_elapsed_seconds}s` : "-"}</strong></span>
                    <span>Winner: <strong>{selectedGame.othello_winner ?? "-"}</strong></span>
                  </>
                )}
              </div>
              {selectedType === "chess" && (selectedGame.move_history?.length ?? 0) > 0 && (
                <div className="move-lines">
                  {movePairs(selectedGame.move_history ?? []).map((line, idx) => (
                    <div className="move-line" key={`${selectedGame.id}-${idx}`}>{line}</div>
                  ))}
                </div>
              )}
              {selectedType === "chess" && selectedGame.pgn && (
                <div className="fen-block">
                  <span>PGN</span>
                  <code>{selectedGame.pgn}</code>
                </div>
              )}
              {selectedType === "chess" && selectedGame.final_fen && (
                <div className="fen-block">
                  <span>Final FEN</span>
                  <code>{selectedGame.final_fen}</code>
                </div>
              )}
              {selectedType === "sudoku" && (
                <div className="sudoku-mini-wrap">
                  {sudokuPuzzleRows && (
                    <div className="sudoku-mini-block">
                      <span>Sudoku Puzzle</span>
                      <div className="sudoku-mini-board">
                        {sudokuPuzzleRows.map((row, rIdx) => (
                          row.split("").map((cell, cIdx) => {
                            const value = cell === "0" ? "" : cell;
                            const classes = [
                              "sudoku-mini-cell",
                              value ? "is-given" : "",
                              rIdx % 3 === 0 ? "top-strong" : "",
                              cIdx % 3 === 0 ? "left-strong" : "",
                              rIdx === 2 || rIdx === 5 ? "row-divider" : "",
                              cIdx === 2 || cIdx === 5 ? "col-divider" : "",
                              rIdx === 8 ? "bottom-strong" : "",
                              cIdx === 8 ? "right-strong" : "",
                            ].filter(Boolean).join(" ");

                            return <div className={classes} key={`p-${rIdx}-${cIdx}`}>{value}</div>;
                          })
                        ))}
                      </div>
                    </div>
                  )}

                  {sudokuUserRows && (
                    <div className="sudoku-mini-block">
                      <span>Your Final Grid</span>
                      <div className="sudoku-mini-board">
                        {sudokuUserRows.map((row, rIdx) => (
                          row.split("").map((cell, cIdx) => {
                            const value = cell === "0" ? "" : cell;
                            const classes = [
                              "sudoku-mini-cell",
                              rIdx % 3 === 0 ? "top-strong" : "",
                              cIdx % 3 === 0 ? "left-strong" : "",
                              rIdx === 2 || rIdx === 5 ? "row-divider" : "",
                              cIdx === 2 || cIdx === 5 ? "col-divider" : "",
                              rIdx === 8 ? "bottom-strong" : "",
                              cIdx === 8 ? "right-strong" : "",
                            ].filter(Boolean).join(" ");

                            return <div className={classes} key={`u-${rIdx}-${cIdx}`}>{value}</div>;
                          })
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {selectedType === "tictactoe" && (
                <>
                  {tttCells.length === 9 && (
                    <div className="ttt-mini-board">
                      {tttCells.map((cell, idx) => (
                        <div className="ttt-mini-cell" key={`ttt-cell-${idx}`}>{cell === "-" ? "" : cell}</div>
                      ))}
                    </div>
                  )}
                  {(selectedGame.tictactoe_move_history?.length ?? 0) > 0 && (
                    <div className="move-lines">
                      {(selectedGame.tictactoe_move_history ?? []).map((line, idx) => (
                        <div className="move-line" key={`${selectedGame.id}-ttt-${idx}`}>{idx + 1}. {line}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {selectedType === "connect4" && (
                <>
                  {connect4Cells.length === 42 && (
                    <div className="connect4-mini-board">
                      {connect4Cells.map((cell, idx) => (
                        <div className="connect4-mini-cell" key={`connect4-cell-${idx}`}>
                          <span
                            className={`connect4-mini-disc ${cell === "R" ? "is-red" : ""} ${cell === "Y" ? "is-yellow" : ""}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {(selectedGame.connect4_move_history?.length ?? 0) > 0 && (
                    <div className="move-lines">
                      {(selectedGame.connect4_move_history ?? []).map((line, idx) => (
                        <div className="move-line" key={`${selectedGame.id}-connect4-${idx}`}>{idx + 1}. {line}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {selectedType === "othello" && (
                <>
                  {othelloCells.length === 64 && (
                    <div className="othello-mini-board">
                      {othelloCells.map((cell, idx) => (
                        <div className="othello-mini-cell" key={`othello-cell-${idx}`}>
                          <span
                            className={`othello-mini-disc ${cell === "B" ? "is-black" : ""} ${cell === "W" ? "is-white" : ""}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {(selectedGame.othello_move_history?.length ?? 0) > 0 && (
                    <div className="move-lines">
                      {(selectedGame.othello_move_history ?? []).map((line, idx) => (
                        <div className="move-line" key={`${selectedGame.id}-othello-${idx}`}>{idx + 1}. {line}</div>
                      ))}
                    </div>
                  )}
                </>
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
