import type { DifficultyLevel, PlayerColor, TimeControl } from "../../types";

type Props = {
  playerColor: PlayerColor | null;
  difficulty: DifficultyLevel | null;
  timeControl: TimeControl | null;
  toLabel: (value: string) => string;
  toTimeControlLabel: (value: TimeControl) => string;
  onSetPlayerColor: (value: PlayerColor) => void;
  onSetDifficulty: (value: DifficultyLevel) => void;
  onSetTimeControl: (value: TimeControl) => void;
  onStart: () => void;
};

export default function PlaySetupPage({
  playerColor,
  difficulty,
  timeControl,
  toLabel,
  toTimeControlLabel,
  onSetPlayerColor,
  onSetDifficulty,
  onSetTimeControl,
  onStart,
}: Props) {
  return (
    <section className="setup-card">
      <h2>Select Side And Difficulty</h2>
      <p>Pick your color and challenge level before starting.</p>

      <h3 className="setup-subtitle">Your Side</h3>
      <div className="setup-actions">
        <button
          className={`btn btn-light ${playerColor === "white" ? "is-selected" : ""}`}
          onClick={() => onSetPlayerColor("white")}
        >
          Play as White
        </button>
        <button
          className={`btn btn-dark ${playerColor === "black" ? "is-selected" : ""}`}
          onClick={() => onSetPlayerColor("black")}
        >
          Play as Black
        </button>
      </div>
      <div className="selection-hint">
        {playerColor ? `Selected: ${toLabel(playerColor)}` : "Select White or Black"}
      </div>

      <h3 className="setup-subtitle">Difficulty</h3>
      <div className="difficulty-actions">
        <button
          className={`btn btn-difficulty ${difficulty === "easy" ? "is-selected" : ""}`}
          onClick={() => onSetDifficulty("easy")}
        >
          Easy
        </button>
        <button
          className={`btn btn-difficulty ${difficulty === "medium" ? "is-selected" : ""}`}
          onClick={() => onSetDifficulty("medium")}
        >
          Medium
        </button>
        <button
          className={`btn btn-difficulty ${difficulty === "hard" ? "is-selected" : ""}`}
          onClick={() => onSetDifficulty("hard")}
        >
          Hard
        </button>
      </div>
      <div className="selection-hint">
        {difficulty ? `Difficulty: ${toLabel(difficulty)}` : "Select Easy, Medium, or Hard"}
      </div>

      <h3 className="setup-subtitle">Time Control</h3>
      <div className="difficulty-actions time-control-actions">
        <button
          className={`btn btn-difficulty ${timeControl === "3+2" ? "is-selected" : ""}`}
          onClick={() => onSetTimeControl("3+2")}
        >
          3 + 2
        </button>
        <button
          className={`btn btn-difficulty ${timeControl === "5+0" ? "is-selected" : ""}`}
          onClick={() => onSetTimeControl("5+0")}
        >
          5 + 0
        </button>
        <button
          className={`btn btn-difficulty ${timeControl === "10+0" ? "is-selected" : ""}`}
          onClick={() => onSetTimeControl("10+0")}
        >
          10 + 0
        </button>
        <button
          className={`btn btn-difficulty ${timeControl === "10+3" ? "is-selected" : ""}`}
          onClick={() => onSetTimeControl("10+3")}
        >
          10 + 3
        </button>
        <button
          className={`btn btn-difficulty ${timeControl === "15+10" ? "is-selected" : ""}`}
          onClick={() => onSetTimeControl("15+10")}
        >
          15 + 10
        </button>
      </div>
      <div className="selection-hint">
        {timeControl ? `Clock: ${toTimeControlLabel(timeControl)}` : "Select a time control"}
      </div>

      <button className="btn btn-start" onClick={onStart} disabled={!playerColor || !difficulty || !timeControl}>
        Start Game
      </button>
    </section>
  );
}
