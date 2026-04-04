export type MinesweeperBoardSize = "small" | "medium" | "large";

export type MinesweeperCell = "M" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export const MINESWEEPER_CONFIG = {
  small: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 9, cols: 9, mines: 10 },
  large: { rows: 16, cols: 30, mines: 99 },
} as const;

/**
 * Parse a board string (represents hidden mine counts) into a 2D grid
 */
export function boardFromString(boardStr: string, cols: number): MinesweeperCell[][] {
  const rows = Math.floor(boardStr.length / cols);
  const grid: MinesweeperCell[][] = [];
  for (let i = 0; i < rows; i++) {
    grid.push(boardStr.slice(i * cols, (i + 1) * cols).split("") as MinesweeperCell[]);
  }
  return grid;
}

/**
 * Convert a 2D grid back to a string
 */
export function boardToString(grid: MinesweeperCell[][]): string {
  return grid.map(row => row.join("")).join("");
}

/**
 * Parse a revealed/flagged state string into a boolean array
 */
export function stateFromString(stateStr: string, rows: number, cols: number): boolean[] {
  const total = rows * cols;
  const result: boolean[] = [];
  for (let i = 0; i < total; i++) {
    result.push(stateStr[i] === "1");
  }
  return result;
}

/**
 * Convert a boolean array back to a state string
 */
export function stateToString(state: boolean[]): string {
  return state.map(v => (v ? "1" : "0")).join("");
}

/**
 * Get the linear index from row/col
 */
export function getIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/**
 * Get row/col from linear index
 */
export function getRowCol(index: number, cols: number): [number, number] {
  return [Math.floor(index / cols), index % cols];
}

/**
 * Get indices of all 8 adjacent neighbors
 */
export function getAdjacentIndices(
  row: number,
  col: number,
  rows: number,
  cols: number,
): number[] {
  const indices: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        indices.push(getIndex(nr, nc, cols));
      }
    }
  }
  return indices;
}

/**
 * Flood fill unrevealed cells starting from the given index.
 * Only spreads through cells with 0 adjacent mines.
 */
export function floodFill(
  board: MinesweeperCell[][],
  revealed: boolean[],
  startIndex: number,
  rows: number,
  cols: number,
): void {
  const stack: number[] = [startIndex];
  const visited = new Set<number>();

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited.has(idx) || revealed[idx]) continue;

    const [row, col] = getRowCol(idx, cols);
    const cell = board[row][col];

    if (cell === "M") continue;

    revealed[idx] = true;
    visited.add(idx);

    // Only continue flooding if this cell has no adjacent mines
    if (cell === "0") {
      for (const adjIdx of getAdjacentIndices(row, col, rows, cols)) {
        if (!visited.has(adjIdx) && !revealed[adjIdx]) {
          stack.push(adjIdx);
        }
      }
    }
  }
}

/**
 * Check if the player has won the game.
 * Win conditions:
 * - All mines are flagged
 * - All non-mine cells are revealed
 */
export function checkWin(
  board: MinesweeperCell[][],
  revealed: boolean[],
  flagged: boolean[],
  rows: number,
  cols: number,
): boolean {
  for (let i = 0; i < rows * cols; i++) {
    const [row, col] = getRowCol(i, cols);
    const cell = board[row][col];

    if (cell === "M" && !flagged[i]) {
      return false;
    }
    if (cell !== "M" && !revealed[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Handle a left-click (reveal) on a cell.
 * Returns:
 * - { lost: true } if a mine was clicked
 * - { won?: true } if the game was won
 * - {} otherwise
 */
export function revealCell(
  board: MinesweeperCell[][],
  revealed: boolean[],
  flagged: boolean[],
  index: number,
  rows: number,
  cols: number,
): { lost?: boolean; won?: boolean } {
  const [row, col] = getRowCol(index, cols);

  // Can't reveal a flagged cell
  if (flagged[index]) {
    return {};
  }

  // Already revealed
  if (revealed[index]) {
    return {};
  }

  const cell = board[row][col];

  // Clicked on a mine
  if (cell === "M") {
    revealed[index] = true;
    return { lost: true };
  }

  // Reveal the cell and flood fill if needed
  floodFill(board, revealed, index, rows, cols);

  // Check for win
  const won = checkWin(board, revealed, flagged, rows, cols);
  return { won };
}

/**
 * Handle a right-click (toggle flag) on a cell.
 */
export function toggleFlag(
  revealed: boolean[],
  flagged: boolean[],
  index: number,
): { won?: boolean } {
  // Can't flag an already revealed cell
  if (revealed[index]) {
    return {};
  }

  flagged[index] = !flagged[index];
  return {};
}

/**
 * Handle a chord (left+right click) on a numbered cell.
 * If the number of adjacent flags equals the mine count, reveal all adjacent unflagged cells.
 */
export function chordCell(
  board: MinesweeperCell[][],
  revealed: boolean[],
  flagged: boolean[],
  index: number,
  rows: number,
  cols: number,
): { lost?: boolean; won?: boolean } {
  const [row, col] = getRowCol(index, cols);

  // Don't chord on mines or unrevealed cells
  if (!revealed[index] || board[row][col] === "M") {
    return {};
  }

  const cell = board[row][col];
  const cellValue = parseInt(cell, 10);

  if (isNaN(cellValue) || cellValue === 0) {
    return {};
  }

  // Count adjacent flags
  const adjacentIndices = getAdjacentIndices(row, col, rows, cols);
  let flagCount = 0;
  for (const adjIdx of adjacentIndices) {
    if (flagged[adjIdx]) {
      flagCount += 1;
    }
  }

  // Only chord if all adjacent mines are flagged
  if (flagCount !== cellValue) {
    return {};
  }

  // Reveal all unflagged adjacent cells
  let lost = false;
  for (const adjIdx of adjacentIndices) {
    if (!flagged[adjIdx]) {
      const result = revealCell(board, revealed, flagged, adjIdx, rows, cols);
      if (result.lost) {
        lost = true;
      }
    }
  }

  if (lost) {
    return { lost: true };
  }

  const won = checkWin(board, revealed, flagged, rows, cols);
  return { won };
}

/**
 * Reveal all mines when the game is lost
 */
export function revealAllMines(
  board: MinesweeperCell[][],
  revealed: boolean[],
  rows: number,
  cols: number,
): void {
  for (let i = 0; i < rows * cols; i++) {
    const [row, col] = getRowCol(i, cols);
    if (board[row][col] === "M") {
      revealed[i] = true;
    }
  }
}

/**
 * Count remaining mines (not flagged)
 */
export function countRemainingMines(
  board: MinesweeperCell[][],
  flagged: boolean[],
  rows: number,
  cols: number,
): number {
  let count = 0;
  for (let i = 0; i < rows * cols; i++) {
    const [row, col] = getRowCol(i, cols);
    if (board[row][col] === "M" && !flagged[i]) {
      count += 1;
    }
  }
  return count;
}
