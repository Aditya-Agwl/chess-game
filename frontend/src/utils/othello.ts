export type OthelloDisc = "B" | "W";
export type OthelloCell = OthelloDisc | "";
export type OthelloWinner = OthelloDisc | "draw" | null;

export const OTHELLO_SIZE = 8;

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

export function opponentDisc(disc: OthelloDisc): OthelloDisc {
  return disc === "B" ? "W" : "B";
}

export function createOthelloBoard(): OthelloCell[][] {
  const board = Array.from({ length: OTHELLO_SIZE }, () => Array.from({ length: OTHELLO_SIZE }, () => "" as OthelloCell));
  board[3][3] = "W";
  board[3][4] = "B";
  board[4][3] = "B";
  board[4][4] = "W";
  return board;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < OTHELLO_SIZE && col >= 0 && col < OTHELLO_SIZE;
}

export function getFlipsForMove(board: OthelloCell[][], row: number, col: number, disc: OthelloDisc): Array<[number, number]> {
  if (!inBounds(row, col) || board[row][col] !== "") return [];

  const enemy = opponentDisc(disc);
  const flips: Array<[number, number]> = [];

  for (const [dr, dc] of DIRECTIONS) {
    const captured: Array<[number, number]> = [];
    let r = row + dr;
    let c = col + dc;

    while (inBounds(r, c) && board[r][c] === enemy) {
      captured.push([r, c]);
      r += dr;
      c += dc;
    }

    if (captured.length > 0 && inBounds(r, c) && board[r][c] === disc) {
      flips.push(...captured);
    }
  }

  return flips;
}

export function getValidMoves(board: OthelloCell[][], disc: OthelloDisc): Array<[number, number]> {
  const moves: Array<[number, number]> = [];
  for (let row = 0; row < OTHELLO_SIZE; row += 1) {
    for (let col = 0; col < OTHELLO_SIZE; col += 1) {
      if (getFlipsForMove(board, row, col, disc).length > 0) {
        moves.push([row, col]);
      }
    }
  }
  return moves;
}

export function applyMove(board: OthelloCell[][], row: number, col: number, disc: OthelloDisc): OthelloCell[][] | null {
  const flips = getFlipsForMove(board, row, col, disc);
  if (flips.length === 0) return null;

  const next = board.map((line) => [...line]);
  next[row][col] = disc;
  for (const [r, c] of flips) {
    next[r][c] = disc;
  }
  return next;
}

export function boardToString(board: OthelloCell[][]): string {
  return board.flat().map((cell) => (cell === "" ? "-" : cell)).join("");
}

export function countDiscs(board: OthelloCell[][]): { B: number; W: number } {
  let B = 0;
  let W = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === "B") B += 1;
      if (cell === "W") W += 1;
    }
  }
  return { B, W };
}

export function winnerForBoard(board: OthelloCell[][]): OthelloWinner {
  const blackMoves = getValidMoves(board, "B").length;
  const whiteMoves = getValidMoves(board, "W").length;
  if (blackMoves > 0 || whiteMoves > 0) {
    return null;
  }

  const counts = countDiscs(board);
  if (counts.B === counts.W) return "draw";
  return counts.B > counts.W ? "B" : "W";
}
