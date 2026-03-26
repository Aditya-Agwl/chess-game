import type { GameResult } from "../types";

export function toLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function resultLabel(result: GameResult): string {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  if (result === "draw") return "Draw";
  return "Aborted";
}

export function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function movePairs(moves: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moves[i] ?? "";
    const blackMove = moves[i + 1] ?? "";
    lines.push(`${moveNumber}. ${whiteMove}${blackMove ? ` ${blackMove}` : ""}`.trim());
  }
  return lines;
}
