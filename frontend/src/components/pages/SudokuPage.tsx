import { useEffect, useMemo, useState } from "react";
import type { DifficultyLevel, GameResult } from "../../types";

type Props = {
  authToken: string;
  apiBase: string;
  onOpenHistory: () => void;
};

type SudokuApiResponse = {
  puzzle: string;
  solution: string;
  difficulty: DifficultyLevel;
};

const DIFFICULTY_OPTIONS: DifficultyLevel[] = ["easy", "medium", "hard"];

function toGrid(input: string): number[] {
  const trimmed = input.trim();
  if (trimmed.length !== 81) {
    return new Array(81).fill(0);
  }
  return trimmed.split("").map((c) => {
    const n = Number(c);
    return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 0;
  });
}

function toGridString(values: number[]): string {
  return values.map((v) => String(Math.max(0, Math.min(9, v)))).join("");
}

function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function SudokuPage({ authToken, apiBase, onOpenHistory }: Props) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Generate a Sudoku and start playing.");

  const [initialPuzzle, setInitialPuzzle] = useState<number[]>(new Array(81).fill(0));
  const [solution, setSolution] = useState<number[]>(new Array(81).fill(0));
  const [grid, setGrid] = useState<number[]>(new Array(81).fill(0));
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const hasPuzzle = useMemo(() => initialPuzzle.some((n) => n !== 0), [initialPuzzle]);

  const fixedCells = useMemo(
    () => new Set(initialPuzzle.map((value, idx) => (value !== 0 ? idx : -1)).filter((idx) => idx >= 0)),
    [initialPuzzle],
  );

  const invalidCells = useMemo(() => {
    const invalid = new Set<number>();
    for (let i = 0; i < 81; i += 1) {
      const value = grid[i];
      if (value === 0) continue;
      if (solution[i] !== 0 && value !== solution[i]) {
        invalid.add(i);
      }
    }
    return invalid;
  }, [grid, solution]);

  async function saveSudokuGame(result: GameResult) {
    if (!authToken || !hasPuzzle || saved) return;

    setSaving(true);
    try {
      const res = await fetch(apiBase + "/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          game_type: "sudoku",
          result,
          difficulty,
          sudoku_puzzle: toGridString(initialPuzzle),
          sudoku_user_grid: toGridString(grid),
          sudoku_elapsed_seconds: elapsedSeconds,
          sudoku_mistakes: mistakes,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data: { detail?: string } = await res.json();
        throw new Error(data.detail || "Could not save Sudoku game");
      }
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save Sudoku game");
    } finally {
      setSaving(false);
    }
  }

  async function createSudoku(nextDifficulty: DifficultyLevel = difficulty) {
    setLoadingPuzzle(true);
    setError("");
    setStatus("Generating puzzle...");

    try {
      const res = await fetch(apiBase + "/sudoku/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          difficulty: nextDifficulty,
        }),
      });

      const data = (await res.json()) as SudokuApiResponse & { detail?: string };
      if (!res.ok) {
        throw new Error(data.detail || "Could not create Sudoku");
      }

      const puzzleGrid = toGrid(data.puzzle);
      const solvedGrid = toGrid(data.solution);

      setDifficulty(data.difficulty ?? nextDifficulty);
      setInitialPuzzle(puzzleGrid);
      setSolution(solvedGrid);
      setGrid(puzzleGrid);
      setSelectedCell(null);
      setMistakes(0);
      setElapsedSeconds(0);
      setCompleted(false);
      setStartedAt(new Date().toISOString());
      setSaved(false);
      setShowSuccessModal(false);
      setStatus("Puzzle ready. Fill all cells correctly to finish.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create Sudoku");
      setStatus("Failed to create puzzle.");
    } finally {
      setLoadingPuzzle(false);
    }
  }

  function placeValue(value: number) {
    if (selectedCell === null || completed) return;
    if (fixedCells.has(selectedCell)) return;

    setGrid((prev) => {
      const next = [...prev];
      const prevValue = next[selectedCell];
      next[selectedCell] = value;

      if (value !== 0 && solution[selectedCell] !== 0 && value !== solution[selectedCell] && prevValue !== value) {
        setMistakes((m) => m + 1);
      }

      return next;
    });
  }

  function resetToInitial() {
    if (!hasPuzzle) return;
    setGrid(initialPuzzle);
    setSelectedCell(null);
    setMistakes(0);
    setElapsedSeconds(0);
    setCompleted(false);
    setSaved(false);
    setShowSuccessModal(false);
    setStartedAt(new Date().toISOString());
    setStatus("Puzzle reset.");
  }

  async function endSudoku() {
    if (completed || !hasPuzzle) return;
    await saveSudokuGame("aborted");
    setStatus("Sudoku ended and saved.");
  }

  useEffect(() => {
    if (!hasPuzzle || completed) return;

    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [hasPuzzle, completed]);

  useEffect(() => {
    if (!hasPuzzle || completed) return;

    const solved = grid.every((value, idx) => value !== 0 && value === solution[idx]);
    if (!solved) return;

    setCompleted(true);
    setShowSuccessModal(true);
    setStatus("Completed! Great solve.");
    void saveSudokuGame("win");
  }, [grid, solution, completed, hasPuzzle]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!hasPuzzle || completed) return;
      if (selectedCell === null || fixedCells.has(selectedCell)) return;

      const key = event.key;
      if (key >= "1" && key <= "9") {
        event.preventDefault();
        placeValue(Number(key));
        return;
      }

      if (key === "Backspace" || key === "Delete" || key === "0") {
        event.preventDefault();
        placeValue(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPuzzle, completed, selectedCell, fixedCells]);

  return (
    <section className="sudoku-page setup-card">
      <div className="sudoku-header">
        <h2>Sudoku Arena</h2>
        <p>Pick a level, solve the puzzle, and track your stats in history.</p>
      </div>

      <div className="sudoku-topbar">
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as DifficultyLevel)}
            disabled={loadingPuzzle || saving}
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
            ))}
          </select>
        </label>
        <div className="sudoku-stats">
          <span>Selected: <strong>{selectedCell === null ? "-" : `R${Math.floor(selectedCell / 9) + 1}C${(selectedCell % 9) + 1}`}</strong></span>
          <span>Timer: <strong>{formatElapsed(elapsedSeconds)}</strong></span>
          <span>Mistakes: <strong>{mistakes}</strong></span>
          <span>Status: <strong>{completed ? "Solved" : "In Progress"}</strong></span>
        </div>
      </div>

      <div className="sudoku-grid" role="grid" aria-label="Sudoku grid">
        {grid.map((value, idx) => {
          const row = Math.floor(idx / 9);
          const col = idx % 9;
          const isFixed = fixedCells.has(idx);
          const isSelected = selectedCell === idx;
          const isInvalid = invalidCells.has(idx);

          const className = [
            "sudoku-cell",
            isFixed ? "is-fixed" : "",
            isSelected ? "is-selected" : "",
            isInvalid ? "is-invalid" : "",
            row % 3 === 0 ? "top-strong" : "",
            col % 3 === 0 ? "left-strong" : "",
            row === 2 || row === 5 ? "row-divider" : "",
            col === 2 || col === 5 ? "col-divider" : "",
            row === 8 ? "bottom-strong" : "",
            col === 8 ? "right-strong" : "",
          ].filter(Boolean).join(" ");

          return (
            <button
              key={idx}
              className={className}
              type="button"
              onClick={() => setSelectedCell(idx)}
              disabled={loadingPuzzle || saving || completed}
            >
              {value === 0 ? "" : value}
            </button>
          );
        })}
      </div>

      <div className="sudoku-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="btn btn-light" onClick={() => placeValue(n)} disabled={!hasPuzzle || saving || loadingPuzzle || completed}>
            {n}
          </button>
        ))}
        <button className="btn btn-dark" onClick={() => placeValue(0)} disabled={!hasPuzzle || saving || loadingPuzzle || completed}>
          Clear Cell
        </button>
      </div>

      <div className="sudoku-actions">
        <button className="btn btn-start" onClick={() => void createSudoku()} disabled={loadingPuzzle || saving}>
          {loadingPuzzle ? "Generating..." : "New Sudoku"}
        </button>
        <button className="btn btn-light" onClick={resetToInitial} disabled={!hasPuzzle || saving || loadingPuzzle}>
          Reset Puzzle
        </button>
        <button className="btn btn-reset" onClick={() => void endSudoku()} disabled={!hasPuzzle || saving || loadingPuzzle || completed}>
          End Sudoku
        </button>
        <button className="btn btn-dark" onClick={onOpenHistory}>
          View Previous Games
        </button>
      </div>

      <p className="hint-line">{status}{saving ? " Saving..." : ""}</p>
      <p className="hint-line">Tip: select a cell, then type 1-9 from keyboard or use the number pad.</p>
      {error && <div className="error-box">{error}</div>}

      {showSuccessModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="sudoku-success-title">
            <h2 id="sudoku-success-title">Sudoku Solved</h2>
            <p>You solved the puzzle in {formatElapsed(elapsedSeconds)} with {mistakes} mistake(s).</p>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={() => void createSudoku()}>
                Play Another
              </button>
              <button className="btn btn-dark" onClick={onOpenHistory}>
                View History
              </button>
              <button className="btn btn-light" onClick={() => setShowSuccessModal(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
