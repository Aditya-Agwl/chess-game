import random

from fastapi import HTTPException

VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def connect4_board_from_string(board_str: str) -> list[list[str]]:
    if len(board_str) != 42:
        raise HTTPException(status_code=400, detail="Invalid board: must be 42 characters")

    cells = list(board_str)
    if any(ch not in {"R", "Y", "-"} for ch in cells):
        raise HTTPException(status_code=400, detail="Invalid board: must contain only R, Y, or -")

    return [cells[i:i + 7] for i in range(0, 42, 7)]


def connect4_board_to_string(board: list[list[str]]) -> str:
    return "".join("".join(row) for row in board)


def connect4_winner(board: list[list[str]]) -> str | None:
    rows, cols = 6, 7

    for row in range(rows):
        for col in range(cols):
            if board[row][col] == "-":
                continue

            disc = board[row][col]
            if col + 3 < cols and all(board[row][col + i] == disc for i in range(4)):
                return disc
            if row + 3 < rows and all(board[row + i][col] == disc for i in range(4)):
                return disc
            if row + 3 < rows and col + 3 < cols and all(board[row + i][col + i] == disc for i in range(4)):
                return disc
            if row + 3 < rows and col - 3 >= 0 and all(board[row + i][col - i] == disc for i in range(4)):
                return disc

    return None


def connect4_available_columns(board: list[list[str]]) -> list[int]:
    return [col for col in range(7) if board[0][col] == "-"]


def connect4_drop_disc(board: list[list[str]], column: int, disc: str) -> tuple[list[list[str]], int] | None:
    if column < 0 or column >= 7:
        return None

    for row in range(5, -1, -1):
        if board[row][column] == "-":
            new_board = [list(row_data) for row_data in board]
            new_board[row][column] = disc
            return new_board, row

    return None


def connect4_minimax(
    board: list[list[str]],
    ai_disc: str,
    human_disc: str,
    depth: int,
    maximizing: bool,
) -> tuple[int, int | None]:
    winner = connect4_winner(board)
    if winner == ai_disc:
        return 10 + depth, None
    if winner == human_disc:
        return -10 - depth, None

    available = connect4_available_columns(board)
    if not available:
        return 0, None

    if depth <= 0:
        return 0, None

    if maximizing:
        best_score = -999
        best_move = available[0]
        for col in available:
            dropped = connect4_drop_disc(board, col, ai_disc)
            if dropped is None:
                continue
            next_board, _ = dropped
            score, _ = connect4_minimax(next_board, ai_disc, human_disc, depth - 1, False)
            if score > best_score:
                best_score = score
                best_move = col
        return best_score, best_move

    best_score = 999
    best_move = available[0]
    for col in available:
        dropped = connect4_drop_disc(board, col, human_disc)
        if dropped is None:
            continue
        next_board, _ = dropped
        score, _ = connect4_minimax(next_board, ai_disc, human_disc, depth - 1, True)
        if score < best_score:
            best_score = score
            best_move = col
    return best_score, best_move


def pick_connect4_move(board_str: str, difficulty: str, ai_disc: str) -> int:
    board = connect4_board_from_string(board_str)

    if difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(status_code=400, detail="Invalid difficulty")

    if ai_disc not in {"R", "Y"}:
        raise HTTPException(status_code=400, detail="Invalid ai_disc")

    if connect4_winner(board) is not None:
        raise HTTPException(status_code=400, detail="Game is already finished")

    available = connect4_available_columns(board)
    if not available:
        raise HTTPException(status_code=400, detail="Board is full")

    human_disc = "Y" if ai_disc == "R" else "R"

    if difficulty == "easy":
        return random.choice(available)

    if difficulty == "medium":
        for col in available:
            dropped = connect4_drop_disc(board, col, ai_disc)
            if dropped is not None and connect4_winner(dropped[0]) == ai_disc:
                return col

        for col in available:
            dropped = connect4_drop_disc(board, col, human_disc)
            if dropped is not None and connect4_winner(dropped[0]) == human_disc:
                return col

        return random.choice(available)

    _, move = connect4_minimax(board, ai_disc, human_disc, 6, True)
    return move if move is not None else random.choice(available)


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
