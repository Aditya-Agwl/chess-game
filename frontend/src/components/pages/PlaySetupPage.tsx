import type { DifficultyLevel, PlayerColor } from "../../types";

type Props = {
  playerColor: PlayerColor | null;
  difficulty: DifficultyLevel | null;
  toLabel: (value: string) => string;
  onSetPlayerColor: (value: PlayerColor) => void;
  onSetDifficulty: (value: DifficultyLevel) => void;
  onStart: () => void;
};

export default function PlaySetupPage({
  playerColor,
  difficulty,
  toLabel,
  onSetPlayerColor,
  onSetDifficulty,
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

      <button className="btn btn-start" onClick={onStart} disabled={!playerColor || !difficulty}>
        Start Game
      </button>
    </section>
  );
}
