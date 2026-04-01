export type Connect4Disc = "R" | "Y";
export type Connect4Cell = Connect4Disc | "";
export type Connect4Winner = Connect4Disc | "draw" | null;

export const CONNECT4_ROWS = 6;
export const CONNECT4_COLS = 7;

export function createConnect4Board(): Connect4Cell[][] {
  return Array.from({ length: CONNECT4_ROWS }, () => Array.from({ length: CONNECT4_COLS }, () => ""));
}

export function findDropRow(board: Connect4Cell[][], column: number): number {
  for (let row = CONNECT4_ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === "") {
      return row;
    }
  }
  return -1;
}

export function dropDisc(
  board: Connect4Cell[][],
  column: number,
  disc: Connect4Disc,
): { board: Connect4Cell[][]; row: number; column: number } | null {
  if (column < 0 || column >= CONNECT4_COLS) return null;

  const row = findDropRow(board, column);
  if (row < 0) return null;

  const next = board.map((line) => [...line]);
  next[row][column] = disc;

  return { board: next, row, column };
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < CONNECT4_ROWS && column >= 0 && column < CONNECT4_COLS;
}

function countDirection(
  board: Connect4Cell[][],
  row: number,
  column: number,
  disc: Connect4Disc,
  dr: number,
  dc: number,
): number {
  let r = row + dr;
  let c = column + dc;
  let count = 0;

  while (inBounds(r, c) && board[r][c] === disc) {
    count += 1;
    r += dr;
    c += dc;
  }

  return count;
}

export function isWinningMove(
  board: Connect4Cell[][],
  row: number,
  column: number,
  disc: Connect4Disc,
): boolean {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;

  return directions.some(([dr, dc]) => {
    const total =
      1
      + countDirection(board, row, column, disc, dr, dc)
      + countDirection(board, row, column, disc, -dr, -dc);
    return total >= 4;
  });
}

export function isBoardFull(board: Connect4Cell[][]): boolean {
  return board[0].every((cell) => cell !== "");
}
