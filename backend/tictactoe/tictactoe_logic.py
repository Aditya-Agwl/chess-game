import random

from fastapi import HTTPException


VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def ttt_lines(board_size: int) -> list[list[int]]:
    lines: list[list[int]] = []

    for row in range(board_size):
        lines.append([row * board_size + col for col in range(board_size)])

    for col in range(board_size):
        lines.append([row * board_size + col for row in range(board_size)])

    lines.append([i * board_size + i for i in range(board_size)])
    lines.append([i * board_size + (board_size - 1 - i) for i in range(board_size)])

    return lines


def ttt_winner(board: list[str], board_size: int) -> str | None:
    for line in ttt_lines(board_size):
        first = board[line[0]]
        if first == "-":
            continue
        if all(board[idx] == first for idx in line):
            return first
    return None


def ttt_available(board: list[str]) -> list[int]:
    return [idx for idx, value in enumerate(board) if value == "-"]


def ttt_minimax(
    board: list[str],
    board_size: int,
    ai_mark: str,
    human_mark: str,
    maximizing: bool,
    alpha: int,
    beta: int,
) -> tuple[int, int | None]:
    winner = ttt_winner(board, board_size)
    if winner == ai_mark:
        return 10, None
    if winner == human_mark:
        return -10, None

    available = ttt_available(board)
    if not available:
        return 0, None

    if maximizing:
        best_score = -999
        best_move = available[0]
        for idx in available:
            board[idx] = ai_mark
            score, _ = ttt_minimax(board, board_size, ai_mark, human_mark, False, alpha, beta)
            board[idx] = "-"
            if score > best_score:
                best_score = score
                best_move = idx
            alpha = max(alpha, best_score)
            if beta <= alpha:
                break
        return best_score, best_move

    best_score = 999
    best_move = available[0]
    for idx in available:
        board[idx] = human_mark
        score, _ = ttt_minimax(board, board_size, ai_mark, human_mark, True, alpha, beta)
        board[idx] = "-"
        if score < best_score:
            best_score = score
            best_move = idx
        beta = min(beta, best_score)
        if beta <= alpha:
            break
    return best_score, best_move


def ttt_board_score(board: list[str], board_size: int, ai_mark: str, human_mark: str) -> int:
    score = 0
    for line in ttt_lines(board_size):
        ai_count = sum(1 for idx in line if board[idx] == ai_mark)
        human_count = sum(1 for idx in line if board[idx] == human_mark)

        if ai_count > 0 and human_count > 0:
            continue
        if ai_count > 0:
            score += 4 ** ai_count
        elif human_count > 0:
            score -= 4 ** human_count

    return score


def ttt_best_heuristic_move(board: list[str], board_size: int, ai_mark: str, human_mark: str) -> int:
    available = ttt_available(board)
    center = (board_size - 1) / 2
    best_score = -(10**9)
    best_move = available[0]

    for idx in available:
        row, col = divmod(idx, board_size)
        board[idx] = ai_mark

        if ttt_winner(board, board_size) == ai_mark:
            board[idx] = "-"
            return idx

        strategic = ttt_board_score(board, board_size, ai_mark, human_mark)
        center_bias = int(10 - (abs(row - center) + abs(col - center)) * 2)
        move_score = strategic + center_bias

        board[idx] = "-"

        if move_score > best_score:
            best_score = move_score
            best_move = idx

    return best_move


def pick_tictactoe_move(board: str, difficulty: str, ai_mark: str, board_size: int) -> int:
    cells = list(board)
    if board_size < 3 or board_size > 8:
        raise HTTPException(status_code=400, detail="Invalid board_size")

    expected_cells = board_size * board_size
    if len(cells) != expected_cells or any(ch not in {"X", "O", "-"} for ch in cells):
        raise HTTPException(status_code=400, detail="Invalid board")

    if ai_mark not in {"X", "O"}:
        raise HTTPException(status_code=400, detail="Invalid ai_mark")

    if difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(status_code=400, detail="Invalid difficulty")

    if ttt_winner(cells, board_size) is not None:
        raise HTTPException(status_code=400, detail="Game is already finished")

    available = ttt_available(cells)
    if not available:
        raise HTTPException(status_code=400, detail="Board is full")

    human_mark = "O" if ai_mark == "X" else "X"

    if difficulty == "easy":
        return random.choice(available)

    if difficulty == "medium":
        for idx in available:
            cells[idx] = ai_mark
            if ttt_winner(cells, board_size) == ai_mark:
                cells[idx] = "-"
                return idx
            cells[idx] = "-"

        for idx in available:
            cells[idx] = human_mark
            if ttt_winner(cells, board_size) == human_mark:
                cells[idx] = "-"
                return idx
            cells[idx] = "-"

        return random.choice(available)

    if board_size == 3:
        _, move = ttt_minimax(cells, board_size, ai_mark, human_mark, True, -999, 999)
        if move is None:
            return random.choice(available)
        return move

    return ttt_best_heuristic_move(cells, board_size, ai_mark, human_mark)


def split_accepted_invites_by_match_status(
    accepted_invites: list[dict],
    match_status_by_id: dict[str, str],
) -> tuple[list[dict], list[dict]]:
    upcoming: list[dict] = []
    completed: list[dict] = []

    for invite in accepted_invites:
        match_id = invite.get("match_id")
        status = match_status_by_id.get(str(match_id), "ongoing") if match_id else "ongoing"
        if status == "finished":
            completed.append(invite)
        else:
            upcoming.append(invite)

    return upcoming, completed
