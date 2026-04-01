import os
from datetime import datetime, timedelta, timezone
import random
from typing import Literal

import chess
import chess.engine
import jwt
from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pymongo import ASCENDING, DESCENDING, MongoClient
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://d12uyfju5i7sl1.cloudfront.net",
        "https://chess.agarwaladi.co.in",
        "https://games.agarwaladi.co.in",
        "https://chess-backend.agarwaladi.co.in",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "chess_game")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "168"))
JWT_ALGORITHM = "HS256"

STOCKFISH_PATH = os.getenv(
    "STOCKFISH_PATH",
    "C:/Users/hp/Desktop/stockfish/stockfish/stockfish-windows-x86-64-avx2.exe"
    if os.name == "nt"
    else "/usr/games/stockfish",
)

engine = None
mongo_client = None
mongo_db = None
users_collection = None
games_collection = None
auth_scheme = HTTPBearer(auto_error=False)

DifficultyLevel = Literal["easy", "medium", "hard"]
PlayerColor = Literal["white", "black"]
GameResult = Literal["win", "loss", "draw", "aborted"]
TimeControl = Literal["3+2", "5+0", "10+0", "10+3", "15+10"]
GameType = Literal["chess", "sudoku", "tictactoe", "connect4"]
TicTacToeMark = Literal["X", "O"]
Connect4Disc = Literal["R", "Y"]

DIFFICULTY_PROFILES = {
    "easy": {
        "time": 0.05,
        "skill": 2,
        "elo": 1400,
    },
    "medium": {
        "time": 0.12,
        "skill": 8,
        "elo": 1400,
    },
    "hard": {
        "time": 0.28,
        "skill": 16,
        "elo": 2000,
    },
}

class BestMoveRequest(BaseModel):
    fen: str
    difficulty: DifficultyLevel = "medium"


class GoogleAuthRequest(BaseModel):
    id_token: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    picture: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class SaveGameRequest(BaseModel):
    game_type: GameType = "chess"
    result: GameResult
    difficulty: DifficultyLevel
    player_color: PlayerColor | None = None
    time_control: TimeControl | None = None
    initial_seconds: int | None = None
    increment_seconds: int | None = None
    white_time_left_ms: int | None = None
    black_time_left_ms: int | None = None
    timeout_loser: PlayerColor | None = None
    final_fen: str | None = None
    move_history: list[str] = Field(default_factory=list)
    pgn: str | None = None
    sudoku_puzzle: str | None = None
    sudoku_solution: str | None = None
    sudoku_user_grid: str | None = None
    sudoku_elapsed_seconds: int | None = None
    sudoku_mistakes: int | None = None
    tictactoe_board: str | None = None
    tictactoe_player_mark: TicTacToeMark | None = None
    tictactoe_winner: str | None = None
    tictactoe_move_history: list[str] = Field(default_factory=list)
    tictactoe_elapsed_seconds: int | None = None
    connect4_board: str | None = None
    connect4_player_disc: Connect4Disc | None = None
    connect4_winner: Connect4Disc | None = None
    connect4_move_history: list[str] = Field(default_factory=list)
    connect4_elapsed_seconds: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class SudokuCreateRequest(BaseModel):
    difficulty: DifficultyLevel = "medium"


class SudokuCreateResponse(BaseModel):
    puzzle: str
    solution: str
    difficulty: DifficultyLevel


class TicTacToeBestMoveRequest(BaseModel):
    board: str
    difficulty: DifficultyLevel = "medium"
    ai_mark: TicTacToeMark = "O"


class Connect4BestMoveRequest(BaseModel):
    board: str
    difficulty: DifficultyLevel = "medium"
    ai_disc: Connect4Disc = "Y"


def serialize_user(doc: dict) -> UserPublic:
    return UserPublic(
        id=str(doc["_id"]),
        email=doc.get("email", ""),
        name=doc.get("name", ""),
        picture=doc.get("picture"),
    )


def serialize_game(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "game_type": doc.get("game_type", "chess"),
        "result": doc.get("result"),
        "difficulty": doc.get("difficulty"),
        "player_color": doc.get("player_color"),
        "time_control": doc.get("time_control"),
        "initial_seconds": doc.get("initial_seconds"),
        "increment_seconds": doc.get("increment_seconds"),
        "white_time_left_ms": doc.get("white_time_left_ms"),
        "black_time_left_ms": doc.get("black_time_left_ms"),
        "timeout_loser": doc.get("timeout_loser"),
        "final_fen": doc.get("final_fen"),
        "move_history": doc.get("move_history", []),
        "pgn": doc.get("pgn"),
        "sudoku_puzzle": doc.get("sudoku_puzzle"),
        "sudoku_solution": doc.get("sudoku_solution"),
        "sudoku_user_grid": doc.get("sudoku_user_grid"),
        "sudoku_elapsed_seconds": doc.get("sudoku_elapsed_seconds"),
        "sudoku_mistakes": doc.get("sudoku_mistakes"),
        "tictactoe_board": doc.get("tictactoe_board"),
        "tictactoe_player_mark": doc.get("tictactoe_player_mark"),
        "tictactoe_winner": doc.get("tictactoe_winner"),
        "tictactoe_move_history": doc.get("tictactoe_move_history", []),
        "tictactoe_elapsed_seconds": doc.get("tictactoe_elapsed_seconds"),
        "connect4_board": doc.get("connect4_board"),
        "connect4_player_disc": doc.get("connect4_player_disc"),
        "connect4_winner": doc.get("connect4_winner"),
        "connect4_move_history": doc.get("connect4_move_history", []),
        "connect4_elapsed_seconds": doc.get("connect4_elapsed_seconds"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "created_at": doc.get("created_at"),
    }


def _chunk_to_grid(values: list[int]) -> list[list[int]]:
    return [values[i:i + 9] for i in range(0, 81, 9)]


def _grid_to_string(grid: list[list[int]]) -> str:
    return "".join(str(value) for row in grid for value in row)


def generate_sudoku(difficulty: DifficultyLevel) -> tuple[str, str]:
    base = 3
    side = base * base

    def pattern(row: int, col: int) -> int:
        return (base * (row % base) + row // base + col) % side

    def shuffled(seq: list[int]) -> list[int]:
        out = seq[:]
        random.shuffle(out)
        return out

    rows = [group * base + row for group in shuffled(list(range(base))) for row in shuffled(list(range(base)))]
    cols = [group * base + col for group in shuffled(list(range(base))) for col in shuffled(list(range(base)))]
    nums = shuffled(list(range(1, side + 1)))

    solved = [[nums[pattern(r, c)] for c in cols] for r in rows]

    removals = {
        "easy": 36,
        "medium": 45,
        "hard": 54,
    }[difficulty]

    puzzle_values = [value for row in solved for value in row]
    for idx in random.sample(range(81), removals):
        puzzle_values[idx] = 0

    puzzle = _grid_to_string(_chunk_to_grid(puzzle_values))
    solution = _grid_to_string(solved)
    return puzzle, solution


def ttt_winner(board: list[str]) -> str | None:
    lines = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),
        (0, 3, 6), (1, 4, 7), (2, 5, 8),
        (0, 4, 8), (2, 4, 6),
    ]
    for a, b, c in lines:
        if board[a] != "-" and board[a] == board[b] == board[c]:
            return board[a]
    return None


def ttt_available(board: list[str]) -> list[int]:
    return [idx for idx, value in enumerate(board) if value == "-"]


def ttt_minimax(board: list[str], ai_mark: str, human_mark: str, maximizing: bool) -> tuple[int, int | None]:
    winner = ttt_winner(board)
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
            score, _ = ttt_minimax(board, ai_mark, human_mark, False)
            board[idx] = "-"
            if score > best_score:
                best_score = score
                best_move = idx
        return best_score, best_move

    best_score = 999
    best_move = available[0]
    for idx in available:
        board[idx] = human_mark
        score, _ = ttt_minimax(board, ai_mark, human_mark, True)
        board[idx] = "-"
        if score < best_score:
            best_score = score
            best_move = idx
    return best_score, best_move


def pick_tictactoe_move(board: str, difficulty: DifficultyLevel, ai_mark: str) -> int:
    cells = list(board)
    if len(cells) != 9 or any(ch not in {"X", "O", "-"} for ch in cells):
        raise HTTPException(status_code=400, detail="Invalid board")

    if ttt_winner(cells) is not None:
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
            if ttt_winner(cells) == ai_mark:
                cells[idx] = "-"
                return idx
            cells[idx] = "-"

        for idx in available:
            cells[idx] = human_mark
            if ttt_winner(cells) == human_mark:
                cells[idx] = "-"
                return idx
            cells[idx] = "-"

        return random.choice(available)

    _, move = ttt_minimax(cells, ai_mark, human_mark, True)
    if move is None:
        return random.choice(available)
    return move


def connect4_board_from_string(board_str: str) -> list[list[str]]:
    """Converts a 42-char string (6x7 board) to a 2D grid."""
    if len(board_str) != 42:
        raise HTTPException(status_code=400, detail="Invalid board: must be 42 characters")
    cells = list(board_str)
    if any(ch not in {"R", "Y", "-"} for ch in cells):
        raise HTTPException(status_code=400, detail="Invalid board: must contain only R, Y, or -")
    return [cells[i:i + 7] for i in range(0, 42, 7)]


def connect4_board_to_string(board: list[list[str]]) -> str:
    """Converts a 2D 6x7 grid back to a 42-char string."""
    return "".join("".join(row) for row in board)


def connect4_winner(board: list[list[str]]) -> str | None:
    """Check if there's a winner (R, Y, or None)."""
    ROWS, COLS = 6, 7
    
    for row in range(ROWS):
        for col in range(COLS):
            if board[row][col] == "-":
                continue
            disc = board[row][col]
            # Horizontal
            if col + 3 < COLS and all(board[row][col + i] == disc for i in range(4)):
                return disc
            # Vertical
            if row + 3 < ROWS and all(board[row + i][col] == disc for i in range(4)):
                return disc
            # Diagonal /
            if row + 3 < ROWS and col + 3 < COLS and all(board[row + i][col + i] == disc for i in range(4)):
                return disc
            # Diagonal \
            if row + 3 < ROWS and col - 3 >= 0 and all(board[row + i][col - i] == disc for i in range(4)):
                return disc
    return None


def connect4_available_columns(board: list[list[str]]) -> list[int]:
    """Returns list of columns where a disc can be dropped."""
    return [col for col in range(7) if board[0][col] == "-"]


def connect4_drop_disc(board: list[list[str]], column: int, disc: str) -> list[list[str]] | None:
    """Drop a disc in a column. Returns new board or None if column is full."""
    if column < 0 or column >= 7:
        return None
    for row in range(5, -1, -1):
        if board[row][column] == "-":
            new_board = [list(row_data) for row_data in board]
            new_board[row][column] = disc
            return new_board
    return None


def connect4_minimax(
    board: list[list[str]],
    ai_disc: str,
    human_disc: str,
    depth: int,
    maximizing: bool,
) -> tuple[int, int | None]:
    """Minimax with depth limit for Connect 4."""
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
            next_board = connect4_drop_disc(board, col, ai_disc)
            if next_board is None:
                continue
            score, _ = connect4_minimax(next_board, ai_disc, human_disc, depth - 1, False)
            if score > best_score:
                best_score = score
                best_move = col
        return best_score, best_move

    best_score = 999
    best_move = available[0]
    for col in available:
        next_board = connect4_drop_disc(board, col, human_disc)
        if next_board is None:
            continue
        score, _ = connect4_minimax(next_board, ai_disc, human_disc, depth - 1, True)
        if score < best_score:
            best_score = score
            best_move = col
    return best_score, best_move


def pick_connect4_move(board_str: str, difficulty: DifficultyLevel, ai_disc: str) -> int:
    """Pick the best Connect 4 move based on difficulty."""
    board = connect4_board_from_string(board_str)
    
    if connect4_winner(board) is not None:
        raise HTTPException(status_code=400, detail="Game is already finished")

    available = connect4_available_columns(board)
    if not available:
        raise HTTPException(status_code=400, detail="Board is full")

    human_disc = "Y" if ai_disc == "R" else "R"

    if difficulty == "easy":
        return random.choice(available)

    if difficulty == "medium":
        # Check if AI can win
        for col in available:
            next_board = connect4_drop_disc(board, col, ai_disc)
            if next_board and connect4_winner(next_board) == ai_disc:
                return col

        # Check if human can win (block)
        for col in available:
            next_board = connect4_drop_disc(board, col, human_disc)
            if next_board and connect4_winner(next_board) == human_disc:
                return col

        return random.choice(available)

    # Hard: minimax with depth 6
    _, move = connect4_minimax(board, ai_disc, human_disc, 6, True)
    return move if move is not None else random.choice(available)


def create_app_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRES_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid auth token")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid auth token")

    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")

    user = users_collection.find_one({"_id": object_id})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def configure_engine_for_difficulty(level: DifficultyLevel):
    profile = DIFFICULTY_PROFILES[level]
    engine.configure({
        "UCI_LimitStrength": True,
        "UCI_Elo": profile["elo"],
        "Skill Level": profile["skill"],
    })

@app.on_event("startup")
def startup():
    global engine, mongo_client, mongo_db, users_collection, games_collection

    if not os.path.exists(STOCKFISH_PATH):
        raise RuntimeError(f"Stockfish not found at: {STOCKFISH_PATH}")
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

    if MONGODB_URI:
        mongo_client = MongoClient(MONGODB_URI)
        mongo_db = mongo_client[MONGODB_DB_NAME]
        users_collection = mongo_db["users"]
        games_collection = mongo_db["games"]
        users_collection.create_index([("google_sub", ASCENDING)], unique=True)
        users_collection.create_index([("email", ASCENDING)], unique=True)
        games_collection.create_index([("user_id", ASCENDING), ("finished_at", DESCENDING)])
        games_collection.create_index([("user_id", ASCENDING), ("game_type", ASCENDING), ("finished_at", DESCENDING)])
    else:
        print("Warning: MONGODB_URI is not set; auth and game history endpoints will not work.")

@app.on_event("shutdown")
def shutdown():
    global engine, mongo_client

    if engine is not None:
        engine.quit()
    if mongo_client is not None:
        mongo_client.close()


@app.post("/auth/google", response_model=AuthResponse)
def auth_google(req: GoogleAuthRequest):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    try:
        token_info = google_id_token.verify_oauth2_token(
            req.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    issuer = token_info.get("iss")
    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")

    google_sub = token_info.get("sub")
    email = token_info.get("email")
    name = token_info.get("name") or "Chess Player"
    picture = token_info.get("picture")
    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Google account email is required")

    now = datetime.now(timezone.utc)
    users_collection.update_one(
        {"google_sub": google_sub},
        {
            "$set": {
                "email": email,
                "name": name,
                "picture": picture,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )

    user_doc = users_collection.find_one({"google_sub": google_sub})
    if user_doc is None:
        raise HTTPException(status_code=500, detail="Could not create user")

    token = create_app_token(str(user_doc["_id"]))
    return AuthResponse(access_token=token, user=serialize_user(user_doc))


@app.get("/me", response_model=UserPublic)
def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@app.post("/games")
def save_game(req: SaveGameRequest, user: dict = Depends(get_current_user)):
    if games_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    if req.game_type == "chess":
        if req.player_color is None:
            raise HTTPException(status_code=400, detail="player_color is required for chess games")
        if req.final_fen is None:
            raise HTTPException(status_code=400, detail="final_fen is required for chess games")
    if req.game_type == "sudoku":
        if req.sudoku_puzzle is None:
            raise HTTPException(status_code=400, detail="sudoku_puzzle is required for sudoku games")
        if req.sudoku_user_grid is None:
            raise HTTPException(status_code=400, detail="sudoku_user_grid is required for sudoku games")
    if req.game_type == "tictactoe":
        if req.tictactoe_board is None:
            raise HTTPException(status_code=400, detail="tictactoe_board is required for tictactoe games")
        if req.tictactoe_player_mark is None:
            raise HTTPException(status_code=400, detail="tictactoe_player_mark is required for tictactoe games")
    if req.game_type == "connect4":
        if req.connect4_board is None:
            raise HTTPException(status_code=400, detail="connect4_board is required for connect4 games")
        if req.connect4_player_disc is None:
            raise HTTPException(status_code=400, detail="connect4_player_disc is required for connect4 games")

    now = datetime.now(timezone.utc)
    payload: dict = {
        "user_id": user["_id"],
        "game_type": req.game_type,
        "result": req.result,
        "difficulty": req.difficulty,
        "started_at": req.started_at or now,
        "finished_at": req.finished_at or now,
        "created_at": now,
    }

    if req.game_type == "chess":
        payload.update({
            "player_color": req.player_color,
            "time_control": req.time_control,
            "initial_seconds": req.initial_seconds,
            "increment_seconds": req.increment_seconds,
            "white_time_left_ms": req.white_time_left_ms,
            "black_time_left_ms": req.black_time_left_ms,
            "timeout_loser": req.timeout_loser,
            "final_fen": req.final_fen,
            "move_history": req.move_history,
            "pgn": req.pgn,
        })
    elif req.game_type == "sudoku":
        payload.update({
            "sudoku_puzzle": req.sudoku_puzzle,
            "sudoku_solution": req.sudoku_solution,
            "sudoku_user_grid": req.sudoku_user_grid,
            "sudoku_elapsed_seconds": req.sudoku_elapsed_seconds,
            "sudoku_mistakes": req.sudoku_mistakes,
        })
    elif req.game_type == "tictactoe":
        payload.update({
            "tictactoe_board": req.tictactoe_board,
            "tictactoe_player_mark": req.tictactoe_player_mark,
            "tictactoe_winner": req.tictactoe_winner,
            "tictactoe_move_history": req.tictactoe_move_history,
            "tictactoe_elapsed_seconds": req.tictactoe_elapsed_seconds,
        })
    else:  # connect4
        payload.update({
            "connect4_board": req.connect4_board,
            "connect4_player_disc": req.connect4_player_disc,
            "connect4_winner": req.connect4_winner,
            "connect4_move_history": req.connect4_move_history,
            "connect4_elapsed_seconds": req.connect4_elapsed_seconds,
        })
    inserted = games_collection.insert_one(payload)
    return {"id": str(inserted.inserted_id)}


@app.get("/games")
def list_games(limit: int = 20, game_type: GameType | None = None, user: dict = Depends(get_current_user)):
    if games_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    safe_limit = max(1, min(limit, 100))
    query: dict = {"user_id": user["_id"]}
    if game_type is not None:
        query["game_type"] = game_type

    docs = games_collection.find(query).sort("finished_at", DESCENDING).limit(safe_limit)
    return {"games": [serialize_game(doc) for doc in docs]}


@app.post("/sudoku/new", response_model=SudokuCreateResponse)
def create_sudoku(req: SudokuCreateRequest):
    puzzle, solution = generate_sudoku(req.difficulty)
    return SudokuCreateResponse(
        puzzle=puzzle,
        solution=solution,
        difficulty=req.difficulty,
    )


@app.post("/tictactoe/best-move")
def tictactoe_best_move(req: TicTacToeBestMoveRequest):
    ai_index = pick_tictactoe_move(req.board, req.difficulty, req.ai_mark)
    return {
        "index": ai_index,
        "difficulty": req.difficulty,
    }


@app.post("/connect4/best-move")
def connect4_best_move(req: Connect4BestMoveRequest):
    ai_column = pick_connect4_move(req.board, req.difficulty, req.ai_disc)
    return {
        "column": ai_column,
        "difficulty": req.difficulty,
    }

@app.post("/best-move")
def best_move(req: BestMoveRequest):
    try:
        board = chess.Board(req.fen)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid FEN string")

    try:
        configure_engine_for_difficulty(req.difficulty)
        level_time = DIFFICULTY_PROFILES[req.difficulty]["time"]
        result = engine.play(board, chess.engine.Limit(time=level_time))
        return {
            "best_move": str(result.move),
            "difficulty": req.difficulty,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")