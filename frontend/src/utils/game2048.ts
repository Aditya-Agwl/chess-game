export type Game2048Direction = "up" | "down" | "left" | "right";

export type Game2048Board = number[][];

export type Game2048Spawn = {
  row: number;
  col: number;
  value: number;
};

export const GAME_2048_SIZE = 4;
const WIN_TILE = 2048;

export function createEmptyBoard(): Game2048Board {
  return Array.from({ length: GAME_2048_SIZE }, () => Array(GAME_2048_SIZE).fill(0));
}

function cloneBoard(board: Game2048Board): Game2048Board {
  return board.map(row => [...row]);
}

export function boardToString(board: Game2048Board): string {
  return JSON.stringify(board);
}

export function boardFromString(value: string): Game2048Board {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== GAME_2048_SIZE) {
      return createEmptyBoard();
    }

    const rows = parsed.map(row => (Array.isArray(row) ? row : []));
    if (!rows.every(row => row.length === GAME_2048_SIZE)) {
      return createEmptyBoard();
    }

    return rows.map(row =>
      row.map(cell => {
        const numeric = Number(cell);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
      }),
    );
  } catch {
    return createEmptyBoard();
  }
}

export function getEmptyCells(board: Game2048Board): Game2048Spawn[] {
  const cells: Game2048Spawn[] = [];
  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === 0) {
        cells.push({ row: rowIndex, col: colIndex, value: 0 });
      }
    });
  });
  return cells;
}

export function addRandomTile(board: Game2048Board): { board: Game2048Board; spawn: Game2048Spawn | null } {
  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) {
    return { board: cloneBoard(board), spawn: null };
  }

  const spawnCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const nextBoard = cloneBoard(board);
  nextBoard[spawnCell.row][spawnCell.col] = Math.random() < 0.9 ? 2 : 4;
  return { board: nextBoard, spawn: { ...spawnCell, value: nextBoard[spawnCell.row][spawnCell.col] } };
}

export function createStartingBoard(): { board: Game2048Board; spawn: Game2048Spawn | null } {
  const first = addRandomTile(createEmptyBoard());
  return addRandomTile(first.board);
}

function collapseLine(line: number[]): { line: number[]; scoreGained: number; moved: boolean } {
  const compact = line.filter(value => value !== 0);
  const merged: number[] = [];
  let scoreGained = 0;

  for (let index = 0; index < compact.length; index += 1) {
    const current = compact[index];
    const next = compact[index + 1];

    if (next !== undefined && current === next) {
      const mergedValue = current * 2;
      merged.push(mergedValue);
      scoreGained += mergedValue;
      index += 1;
    } else {
      merged.push(current);
    }
  }

  while (merged.length < GAME_2048_SIZE) {
    merged.push(0);
  }

  const moved = merged.some((value, index) => value !== line[index]);
  return { line: merged, scoreGained, moved };
}

function readLine(board: Game2048Board, direction: Game2048Direction, index: number): number[] {
  if (direction === "left") return [...board[index]];
  if (direction === "right") return [...board[index]].reverse();
  if (direction === "up") return board.map(row => row[index]);
  return board.map(row => row[index]).reverse();
}

function writeLine(board: Game2048Board, direction: Game2048Direction, index: number, line: number[]): void {
  const values = direction === "right" || direction === "down" ? [...line].reverse() : line;

  if (direction === "left" || direction === "right") {
    board[index] = [...values];
    return;
  }

  values.forEach((value, rowIndex) => {
    board[rowIndex][index] = value;
  });
}

export function moveBoard(board: Game2048Board, direction: Game2048Direction): { board: Game2048Board; moved: boolean; scoreGained: number } {
  const nextBoard = cloneBoard(board);
  let moved = false;
  let scoreGained = 0;

  for (let index = 0; index < GAME_2048_SIZE; index += 1) {
    const line = readLine(nextBoard, direction, index);
    const collapsed = collapseLine(line);
    if (collapsed.moved) {
      moved = true;
    }
    scoreGained += collapsed.scoreGained;
    writeLine(nextBoard, direction, index, collapsed.line);
  }

  return { board: nextBoard, moved, scoreGained };
}

export function canMove(board: Game2048Board): boolean {
  if (getEmptyCells(board).length > 0) {
    return true;
  }

  for (let row = 0; row < GAME_2048_SIZE; row += 1) {
    for (let col = 0; col < GAME_2048_SIZE; col += 1) {
      const current = board[row][col];
      const right = board[row][col + 1];
      const down = board[row + 1]?.[col];
      if (current === right || current === down) {
        return true;
      }
    }
  }

  return false;
}

export function getMaxTile(board: Game2048Board): number {
  return Math.max(...board.flat(), 0);
}

export function hasWon(board: Game2048Board): boolean {
  return getMaxTile(board) >= WIN_TILE;
}
