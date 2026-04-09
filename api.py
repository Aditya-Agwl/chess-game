import os
import re
import asyncio
from datetime import datetime, timedelta, timezone
import random
from typing import Literal

import chess
import chess.engine
import jwt
from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pymongo import ASCENDING, DESCENDING, MongoClient
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from backend.tictactoe.tictactoe_routes import build_tictactoe_handlers
from backend.connect4.connect4_routes import build_connect4_handlers

if os.name == "nt":
    # python-chess launches Stockfish via asyncio subprocess; Proactor loop is required on Windows.
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

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
tictactoe_invites_collection = None
tictactoe_matches_collection = None
connect4_invites_collection = None
connect4_matches_collection = None
auth_scheme = HTTPBearer(auto_error=False)


class RealtimeHub:
    def __init__(self):
        self.user_connections: dict[str, set[WebSocket]] = {}
        self.socket_user: dict[WebSocket, str] = {}
        self.room_connections: dict[str, set[WebSocket]] = {}
        self.socket_rooms: dict[WebSocket, set[str]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.user_connections.setdefault(user_id, set()).add(websocket)
        self.socket_user[websocket] = user_id
        self.socket_rooms[websocket] = set()

    def disconnect(self, websocket: WebSocket):
        user_id = self.socket_user.pop(websocket, None)
        if user_id is not None:
            sockets = self.user_connections.get(user_id, set())
            sockets.discard(websocket)
            if not sockets:
                self.user_connections.pop(user_id, None)

        joined_rooms = self.socket_rooms.pop(websocket, set())
        for room in joined_rooms:
            sockets = self.room_connections.get(room, set())
            sockets.discard(websocket)
            if not sockets:
                self.room_connections.pop(room, None)

    def join_room(self, websocket: WebSocket, room: str):
        self.room_connections.setdefault(room, set()).add(websocket)
        self.socket_rooms.setdefault(websocket, set()).add(room)

    def leave_room(self, websocket: WebSocket, room: str):
        sockets = self.room_connections.get(room, set())
        sockets.discard(websocket)
        if not sockets:
            self.room_connections.pop(room, None)

        joined_rooms = self.socket_rooms.get(websocket, set())
        joined_rooms.discard(room)

    async def send_to_socket(self, websocket: WebSocket, event: str, payload: dict):
        try:
            await websocket.send_json({"event": event, "payload": payload})
        except Exception:
            self.disconnect(websocket)

    async def send_user(self, user_id: str, event: str, payload: dict):
        sockets = list(self.user_connections.get(user_id, set()))
        for socket in sockets:
            await self.send_to_socket(socket, event, payload)

    async def send_room(self, room: str, event: str, payload: dict):
        sockets = list(self.room_connections.get(room, set()))
        for socket in sockets:
            await self.send_to_socket(socket, event, payload)


realtime_hub = RealtimeHub()

DifficultyLevel = Literal["easy", "medium", "hard"]
PlayerColor = Literal["white", "black"]
GameResult = Literal["win", "loss", "draw", "aborted"]
TimeControl = Literal["3+2", "5+0", "10+0", "10+3", "15+10"]
GameType = Literal["chess", "sudoku", "tictactoe", "connect4", "othello", "minesweeper", "2048"]
TicTacToeMode = Literal["local", "ai", "friend"]
TicTacToeMark = Literal["X", "O"]
Connect4Disc = Literal["R", "Y"]
OthelloDisc = Literal["B", "W"]
DiscWinner = Literal["R", "Y", "B", "W", "draw"]
MineweeperBoardSize = Literal["small", "medium", "large"]

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


class UserSummary(BaseModel):
    id: str
    email: str
    name: str
    picture: str | None = None
    relation: Literal["self", "friend", "incoming_request", "outgoing_request", "none"] = "none"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class FriendRequestCreate(BaseModel):
    target_user_id: str


class FriendRequestAction(BaseModel):
    action: Literal["accept", "reject"]


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
    tictactoe_mode: TicTacToeMode | None = None
    tictactoe_board_size: int | None = Field(default=None, ge=3, le=8)
    connect4_board: str | None = None
    connect4_player_disc: Connect4Disc | None = None
    connect4_winner: DiscWinner | None = None
    connect4_move_history: list[str] = Field(default_factory=list)
    connect4_elapsed_seconds: int | None = None
    othello_board: str | None = None
    othello_player_disc: OthelloDisc | None = None
    othello_winner: DiscWinner | None = None
    othello_move_history: list[str] = Field(default_factory=list)
    othello_elapsed_seconds: int | None = None
    minesweeper_board: str | None = None
    minesweeper_board_size: MineweeperBoardSize | None = None
    minesweeper_mines: str | None = None
    minesweeper_revealed: str | None = None
    minesweeper_flagged: str | None = None
    minesweeper_winner: str | None = None
    minesweeper_elapsed_seconds: int | None = None
    game_2048_board: str | None = None
    game_2048_score: int | None = None
    game_2048_moves: int | None = None
    game_2048_max_tile: int | None = None
    game_2048_elapsed_seconds: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class SudokuCreateRequest(BaseModel):
    difficulty: DifficultyLevel = "medium"


class SudokuCreateResponse(BaseModel):
    puzzle: str
    solution: str
    difficulty: DifficultyLevel


class OthelloBestMoveRequest(BaseModel):
    board: str
    difficulty: DifficultyLevel = "medium"
    ai_disc: OthelloDisc = "W"


class MinesweeperCreateRequest(BaseModel):
    board_size: MineweeperBoardSize = "medium"


class MinesweeperCreateResponse(BaseModel):
    board: str
    mines: str
    rows: int
    cols: int
    mine_count: int
    board_size: MineweeperBoardSize


def serialize_user(doc: dict) -> UserPublic:
    return UserPublic(
        id=str(doc["_id"]),
        email=doc.get("email", ""),
        name=doc.get("name", ""),
        picture=doc.get("picture"),
    )


def serialize_user_summary(
    doc: dict,
    relation: Literal["self", "friend", "incoming_request", "outgoing_request", "none"] = "none",
) -> UserSummary:
    return UserSummary(
        id=str(doc["_id"]),
        email=doc.get("email", ""),
        name=doc.get("name", ""),
        picture=doc.get("picture"),
        relation=relation,
    )


def parse_object_id(value: str, *, field_name: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def normalize_social_fields(user_doc: dict) -> dict:
    if users_collection is None:
        return user_doc

    updates: dict = {}
    for field in ["friend_ids", "friend_request_incoming_ids", "friend_request_outgoing_ids"]:
        if not isinstance(user_doc.get(field), list):
            updates[field] = []

    if updates:
        users_collection.update_one({"_id": user_doc["_id"]}, {"$set": updates})
        user_doc = {**user_doc, **updates}

    return user_doc


def to_object_id_set(values: list) -> set[ObjectId]:
    ids: set[ObjectId] = set()
    for value in values:
        if isinstance(value, ObjectId):
            ids.add(value)
            continue
        try:
            ids.add(ObjectId(str(value)))
        except Exception:
            continue
    return ids


def relation_to_user(current_user: dict, target_user_id: ObjectId) -> Literal["self", "friend", "incoming_request", "outgoing_request", "none"]:
    current_id = current_user["_id"]
    if current_id == target_user_id:
        return "self"

    friends = to_object_id_set(current_user.get("friend_ids", []))
    incoming = to_object_id_set(current_user.get("friend_request_incoming_ids", []))
    outgoing = to_object_id_set(current_user.get("friend_request_outgoing_ids", []))

    if target_user_id in friends:
        return "friend"
    if target_user_id in incoming:
        return "incoming_request"
    if target_user_id in outgoing:
        return "outgoing_request"
    return "none"


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
        "tictactoe_mode": doc.get("tictactoe_mode"),
        "tictactoe_board_size": doc.get("tictactoe_board_size"),
        "tictactoe_move_history": doc.get("tictactoe_move_history", []),
        "tictactoe_elapsed_seconds": doc.get("tictactoe_elapsed_seconds"),
        "connect4_board": doc.get("connect4_board"),
        "connect4_player_disc": doc.get("connect4_player_disc"),
        "connect4_winner": doc.get("connect4_winner"),
        "connect4_move_history": doc.get("connect4_move_history", []),
        "connect4_elapsed_seconds": doc.get("connect4_elapsed_seconds"),
        "othello_board": doc.get("othello_board"),
        "othello_player_disc": doc.get("othello_player_disc"),
        "othello_winner": doc.get("othello_winner"),
        "othello_move_history": doc.get("othello_move_history", []),
        "othello_elapsed_seconds": doc.get("othello_elapsed_seconds"),
        "minesweeper_board": doc.get("minesweeper_board"),
        "minesweeper_board_size": doc.get("minesweeper_board_size"),
        "minesweeper_mines": doc.get("minesweeper_mines"),
        "minesweeper_revealed": doc.get("minesweeper_revealed"),
        "minesweeper_flagged": doc.get("minesweeper_flagged"),
        "minesweeper_winner": doc.get("minesweeper_winner"),
        "minesweeper_elapsed_seconds": doc.get("minesweeper_elapsed_seconds"),
        "game_2048_board": doc.get("game_2048_board"),
        "game_2048_score": doc.get("game_2048_score"),
        "game_2048_moves": doc.get("game_2048_moves"),
        "game_2048_max_tile": doc.get("game_2048_max_tile"),
        "game_2048_elapsed_seconds": doc.get("game_2048_elapsed_seconds"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "created_at": doc.get("created_at"),
    }


def ttt_match_room(match_id: ObjectId | str) -> str:
    return f"ttt:match:{str(match_id)}"


async def publish_ttt_invite_event(invite_doc: dict, event: str):
    from_user_id = str(invite_doc.get("from_user_id"))
    to_user_id = str(invite_doc.get("to_user_id"))

    await realtime_hub.send_user(from_user_id, event, {
        "invite_id": str(invite_doc.get("_id")),
        "status": invite_doc.get("status"),
    })
    await realtime_hub.send_user(to_user_id, event, {
        "invite_id": str(invite_doc.get("_id")),
        "status": invite_doc.get("status"),
    })


async def publish_ttt_match_event(match_doc: dict):
    room = ttt_match_room(match_doc.get("_id"))
    payload = {
        "match_id": str(match_doc.get("_id")),
        "status": match_doc.get("status"),
        "winner": match_doc.get("winner"),
        "board": match_doc.get("board"),
        "current_turn": match_doc.get("current_turn"),
        "updated_at": match_doc.get("updated_at"),
    }
    await realtime_hub.send_room(room, "ttt.match.updated", payload)

    inviter_id = str(match_doc.get("inviter_id"))
    invitee_id = str(match_doc.get("invitee_id"))
    await realtime_hub.send_user(inviter_id, "ttt.match.updated", payload)
    await realtime_hub.send_user(invitee_id, "ttt.match.updated", payload)


async def publish_c4_invite_event(invite_doc: dict, event: str):
    from_user_id = str(invite_doc.get("from_user_id"))
    to_user_id = str(invite_doc.get("to_user_id"))

    await realtime_hub.send_user(from_user_id, event, {
        "invite_id": str(invite_doc.get("_id")),
        "status": invite_doc.get("status"),
    })
    await realtime_hub.send_user(to_user_id, event, {
        "invite_id": str(invite_doc.get("_id")),
        "status": invite_doc.get("status"),
    })


async def publish_c4_match_event(match_doc: dict):
    room = c4_match_room(match_doc.get("_id"))
    payload = {
        "match_id": str(match_doc.get("_id")),
        "status": match_doc.get("status"),
        "winner": match_doc.get("winner"),
        "board": match_doc.get("board"),
        "current_turn": match_doc.get("current_turn"),
        "updated_at": match_doc.get("updated_at"),
    }
    await realtime_hub.send_room(room, "c4.match.updated", payload)

    inviter_id = str(match_doc.get("inviter_id"))
    invitee_id = str(match_doc.get("invitee_id"))
    await realtime_hub.send_user(inviter_id, "c4.match.updated", payload)
    await realtime_hub.send_user(invitee_id, "c4.match.updated", payload)


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


def othello_board_from_string(board_str: str) -> list[list[str]]:
    if len(board_str) != 64:
        raise HTTPException(status_code=400, detail="Invalid board: must be 64 characters")
    cells = list(board_str)
    if any(ch not in {"B", "W", "-"} for ch in cells):
        raise HTTPException(status_code=400, detail="Invalid board: must contain only B, W, or -")
    return [cells[i:i + 8] for i in range(0, 64, 8)]


def othello_opponent(disc: str) -> str:
    return "W" if disc == "B" else "B"


def othello_in_bounds(row: int, col: int) -> bool:
    return 0 <= row < 8 and 0 <= col < 8


def othello_flips_for_move(board: list[list[str]], row: int, col: int, disc: str) -> list[tuple[int, int]]:
    if not othello_in_bounds(row, col) or board[row][col] != "-":
        return []

    opponent = othello_opponent(disc)
    directions = [
        (-1, -1), (-1, 0), (-1, 1),
        (0, -1),           (0, 1),
        (1, -1),  (1, 0),  (1, 1),
    ]
    flips: list[tuple[int, int]] = []

    for dr, dc in directions:
        r = row + dr
        c = col + dc
        captured: list[tuple[int, int]] = []
        while othello_in_bounds(r, c) and board[r][c] == opponent:
            captured.append((r, c))
            r += dr
            c += dc

        if captured and othello_in_bounds(r, c) and board[r][c] == disc:
            flips.extend(captured)

    return flips


def othello_valid_moves(board: list[list[str]], disc: str) -> list[tuple[int, int]]:
    moves: list[tuple[int, int]] = []
    for row in range(8):
        for col in range(8):
            if othello_flips_for_move(board, row, col, disc):
                moves.append((row, col))
    return moves


def othello_apply_move(board: list[list[str]], row: int, col: int, disc: str) -> list[list[str]] | None:
    flips = othello_flips_for_move(board, row, col, disc)
    if not flips:
        return None

    next_board = [list(line) for line in board]
    next_board[row][col] = disc
    for r, c in flips:
        next_board[r][c] = disc
    return next_board


def othello_count(board: list[list[str]], disc: str) -> int:
    return sum(1 for row in board for cell in row if cell == disc)


def othello_is_terminal(board: list[list[str]]) -> bool:
    return not othello_valid_moves(board, "B") and not othello_valid_moves(board, "W")


def othello_winner(board: list[list[str]]) -> str | None:
    if not othello_is_terminal(board):
        return None
    black = othello_count(board, "B")
    white = othello_count(board, "W")
    if black == white:
        return "draw"
    return "B" if black > white else "W"


OTHELLO_WEIGHTS = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
]


def othello_evaluate(board: list[list[str]], ai_disc: str) -> int:
    human_disc = othello_opponent(ai_disc)

    ai_tiles = othello_count(board, ai_disc)
    human_tiles = othello_count(board, human_disc)
    piece_score = (ai_tiles - human_tiles) * 2

    ai_mobility = len(othello_valid_moves(board, ai_disc))
    human_mobility = len(othello_valid_moves(board, human_disc))
    mobility_score = (ai_mobility - human_mobility) * 5

    positional_score = 0
    for row in range(8):
        for col in range(8):
            if board[row][col] == ai_disc:
                positional_score += OTHELLO_WEIGHTS[row][col]
            elif board[row][col] == human_disc:
                positional_score -= OTHELLO_WEIGHTS[row][col]

    return piece_score + mobility_score + positional_score


def othello_minimax(
    board: list[list[str]],
    ai_disc: str,
    current_disc: str,
    depth: int,
    alpha: int,
    beta: int,
) -> tuple[int, tuple[int, int] | None]:
    if depth <= 0 or othello_is_terminal(board):
        winner = othello_winner(board)
        if winner == ai_disc:
            return 10_000 + depth, None
        if winner == othello_opponent(ai_disc):
            return -10_000 - depth, None
        if winner == "draw":
            return 0, None
        return othello_evaluate(board, ai_disc), None

    moves = othello_valid_moves(board, current_disc)
    if not moves:
        return othello_minimax(board, ai_disc, othello_opponent(current_disc), depth - 1, alpha, beta)

    maximizing = current_disc == ai_disc
    best_move: tuple[int, int] | None = None

    if maximizing:
        best_score = -1_000_000
        for row, col in moves:
            next_board = othello_apply_move(board, row, col, current_disc)
            if next_board is None:
                continue
            score, _ = othello_minimax(next_board, ai_disc, othello_opponent(current_disc), depth - 1, alpha, beta)
            if score > best_score:
                best_score = score
                best_move = (row, col)
            alpha = max(alpha, best_score)
            if beta <= alpha:
                break
        return best_score, best_move

    best_score = 1_000_000
    for row, col in moves:
        next_board = othello_apply_move(board, row, col, current_disc)
        if next_board is None:
            continue
        score, _ = othello_minimax(next_board, ai_disc, othello_opponent(current_disc), depth - 1, alpha, beta)
        if score < best_score:
            best_score = score
            best_move = (row, col)
        beta = min(beta, best_score)
        if beta <= alpha:
            break
    return best_score, best_move


def pick_othello_move(board_str: str, difficulty: DifficultyLevel, ai_disc: str) -> dict:
    board = othello_board_from_string(board_str)
    moves = othello_valid_moves(board, ai_disc)

    if not moves:
        return {"pass": True}

    if difficulty == "easy":
        row, col = random.choice(moves)
        return {"row": row, "col": col, "pass": False}

    if difficulty == "medium":
        best_flips = -1
        best_move = moves[0]
        for row, col in moves:
            flips = len(othello_flips_for_move(board, row, col, ai_disc))
            if flips > best_flips:
                best_flips = flips
                best_move = (row, col)
        return {"row": best_move[0], "col": best_move[1], "pass": False}

    # Hard: alpha-beta minimax with positional + mobility evaluation.
    _, best_move = othello_minimax(board, ai_disc, ai_disc, 5, -1_000_000, 1_000_000)
    if best_move is None:
        row, col = random.choice(moves)
        return {"row": row, "col": col, "pass": False}
    return {"row": best_move[0], "col": best_move[1], "pass": False}


# Minesweeper game logic
MINESWEEPER_CONFIG = {
    "small": {"rows": 8, "cols": 8, "mines": 10},
    "medium": {"rows": 9, "cols": 9, "mines": 10},
    "large": {"rows": 16, "cols": 30, "mines": 99},
}


def generate_minesweeper_board(board_size: MineweeperBoardSize) -> tuple[str, str]:
    """Generate a new minesweeper board with mines randomly placed.
    
    Returns:
        (board_str, mines_str) - board is empty cells (0-8 for adjacent mines), 
        mines_str contains 'M' for mines, '-' for empty
    """
    config = MINESWEEPER_CONFIG[board_size]
    rows, cols, num_mines = config["rows"], config["cols"], config["mines"]
    total_cells = rows * cols
    
    # Generate random mine positions
    mine_positions = set(random.sample(range(total_cells), min(num_mines, total_cells)))
    
    # Create mines board
    mines = ['M' if i in mine_positions else '-' for i in range(total_cells)]
    mines_str = "".join(mines)
    
    # Create board with mine counts
    board = ['-'] * total_cells
    for i in range(total_cells):
        if mines[i] == 'M':
            board[i] = 'M'
        else:
            # Count adjacent mines
            row, col = i // cols, i % cols
            mine_count = 0
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        idx = nr * cols + nc
                        if mines[idx] == 'M':
                            mine_count += 1
            board[i] = str(mine_count) if mine_count > 0 else '0'
    
    board_str = "".join(board)
    return board_str, mines_str


def minesweeper_indices_from_str(s: str, rows: int, cols: int) -> str:
    """Validate that a string represents valid cell indices for a board."""
    if len(s) != rows * cols:
        raise HTTPException(status_code=400, detail=f"Board must be {rows * cols} characters")
    return s


def minesweeper_get_adjacent(row: int, col: int, rows: int, cols: int) -> list[int]:
    """Get indices of adjacent cells (excluding diagonals for neighbors)."""
    indices = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            indices.append(nr * cols + nc)
    return indices


def minesweeper_flood_fill(
    board: list[str],
    revealed: list[bool],
    idx: int,
    rows: int,
    cols: int,
) -> None:
    """Flood fill unrevealed cells starting from idx (which must be safe).
    Only spreads through cells with 0 adjacent mines.
    """
    if revealed[idx] or board[idx] == 'M':
        return
    
    revealed[idx] = True
    
    # Only continue flooding if this cell has no adjacent mines
    if board[idx] != '0':
        return
    
    row, col = idx // cols, idx % cols
    for adj_idx in minesweeper_get_adjacent(row, col, rows, cols):
        if not revealed[adj_idx]:
            minesweeper_flood_fill(board, revealed, adj_idx, rows, cols)


def minesweeper_check_win(board: list[str], revealed: list[bool], flagged: list[bool], rows: int, cols: int) -> bool:
    """Check if player has won: all non-mine cells revealed and all mines flagged."""
    for i in range(rows * cols):
        if board[i] == 'M':
            if not flagged[i]:
                return False
        else:
            if not revealed[i]:
                return False
    return True


def create_app_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRES_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid auth token")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    except HTTPException:
        raise
    except Exception:
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
    return normalize_social_fields(user)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
) -> dict:
    if credentials is None:
        print("ERROR: No credentials provided")
        raise HTTPException(status_code=401, detail="Missing auth token")

    return get_user_from_token(credentials.credentials)


def _get_users_collection():
    return users_collection


def _get_games_collection():
    return games_collection


def _get_ttt_invites_collection():
    return tictactoe_invites_collection


def _get_ttt_matches_collection():
    return tictactoe_matches_collection


def _get_c4_invites_collection():
    return connect4_invites_collection


def _get_c4_matches_collection():
    return connect4_matches_collection


ttt_handlers = build_tictactoe_handlers({
    "get_current_user": get_current_user,
    "parse_object_id": parse_object_id,
    "serialize_user_summary": serialize_user_summary,
    "get_users_collection": _get_users_collection,
    "get_games_collection": _get_games_collection,
    "get_invites_collection": _get_ttt_invites_collection,
    "get_matches_collection": _get_ttt_matches_collection,
    "publish_invite_event": publish_ttt_invite_event,
    "publish_match_event": publish_ttt_match_event,
})
ttt_handlers["register"](app)
ttt_play_friend_move_internal = ttt_handlers["play_friend_move_internal"]

c4_handlers = build_connect4_handlers({
    "get_current_user": get_current_user,
    "parse_object_id": parse_object_id,
    "serialize_user_summary": serialize_user_summary,
    "get_users_collection": _get_users_collection,
    "get_games_collection": _get_games_collection,
    "get_invites_collection": _get_c4_invites_collection,
    "get_matches_collection": _get_c4_matches_collection,
    "publish_invite_event": publish_c4_invite_event,
    "publish_match_event": publish_c4_match_event,
})
c4_handlers["register"](app)
c4_match_room = c4_handlers["match_room"]
c4_play_friend_move_internal = c4_handlers["play_friend_move_internal"]


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
    global tictactoe_invites_collection, tictactoe_matches_collection
    global connect4_invites_collection, connect4_matches_collection

    if not os.path.exists(STOCKFISH_PATH):
        print(f"Warning: Stockfish not found at: {STOCKFISH_PATH}; chess engine endpoints will be unavailable.")
        engine = None
    else:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        except Exception as exc:
            print(f"Warning: Could not start Stockfish engine ({exc}); chess engine endpoints will be unavailable.")
            engine = None

    if MONGODB_URI:
        mongo_client = MongoClient(MONGODB_URI)
        mongo_db = mongo_client[MONGODB_DB_NAME]
        users_collection = mongo_db["users"]
        games_collection = mongo_db["games"]
        tictactoe_invites_collection = mongo_db["tictactoe_invites"]
        tictactoe_matches_collection = mongo_db["tictactoe_friend_matches"]
        connect4_invites_collection = mongo_db["connect4_invites"]
        connect4_matches_collection = mongo_db["connect4_friend_matches"]
        users_collection.create_index([("google_sub", ASCENDING)], unique=True)
        users_collection.create_index([("email", ASCENDING)], unique=True)
        users_collection.create_index([("name", ASCENDING)])
        games_collection.create_index([("user_id", ASCENDING), ("finished_at", DESCENDING)])
        games_collection.create_index([("user_id", ASCENDING), ("game_type", ASCENDING), ("finished_at", DESCENDING)])
        tictactoe_invites_collection.create_index([("from_user_id", ASCENDING), ("to_user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])
        tictactoe_invites_collection.create_index([("to_user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])
        tictactoe_matches_collection.create_index([("player_user_ids", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)])
        connect4_invites_collection.create_index([("from_user_id", ASCENDING), ("to_user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])
        connect4_invites_collection.create_index([("to_user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])
        connect4_matches_collection.create_index([("player_user_ids", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)])
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
                "friend_ids": [],
                "friend_request_incoming_ids": [],
                "friend_request_outgoing_ids": [],
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


@app.get("/profile")
def profile(user: dict = Depends(get_current_user)):
    friends = to_object_id_set(user.get("friend_ids", []))
    incoming = to_object_id_set(user.get("friend_request_incoming_ids", []))
    outgoing = to_object_id_set(user.get("friend_request_outgoing_ids", []))
    return {
        "user": serialize_user(user),
        "friends_count": len(friends),
        "incoming_requests_count": len(incoming),
        "outgoing_requests_count": len(outgoing),
        "created_at": user.get("created_at"),
    }


@app.get("/users")
def list_users(q: str = "", limit: int = 30, user: dict = Depends(get_current_user)):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    safe_limit = max(1, min(limit, 100))
    query: dict = {"_id": {"$ne": user["_id"]}}

    clean_q = q.strip()
    if clean_q:
        pattern = re.escape(clean_q)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
        ]

    docs = users_collection.find(query).sort("name", ASCENDING).limit(safe_limit)
    return {
        "query": clean_q,
        "users": [
            serialize_user_summary(doc, relation_to_user(user, doc["_id"]))
            for doc in docs
        ],
    }


@app.get("/friends")
def list_friends(user: dict = Depends(get_current_user)):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    friend_ids = list(to_object_id_set(user.get("friend_ids", [])))
    incoming_ids = list(to_object_id_set(user.get("friend_request_incoming_ids", [])))
    outgoing_ids = list(to_object_id_set(user.get("friend_request_outgoing_ids", [])))

    friend_docs = users_collection.find({"_id": {"$in": friend_ids}}).sort("name", ASCENDING)
    incoming_docs = users_collection.find({"_id": {"$in": incoming_ids}}).sort("name", ASCENDING)
    outgoing_docs = users_collection.find({"_id": {"$in": outgoing_ids}}).sort("name", ASCENDING)

    return {
        "friends": [serialize_user_summary(doc, "friend") for doc in friend_docs],
        "incoming_requests": [serialize_user_summary(doc, "incoming_request") for doc in incoming_docs],
        "outgoing_requests": [serialize_user_summary(doc, "outgoing_request") for doc in outgoing_docs],
    }


@app.post("/friends/requests")
def send_friend_request(req: FriendRequestCreate, user: dict = Depends(get_current_user)):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    source_id = user["_id"]
    target_id = parse_object_id(req.target_user_id, field_name="target_user_id")
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="You cannot send a friend request to yourself")

    target_user = users_collection.find_one({"_id": target_id})
    if target_user is None:
        raise HTTPException(status_code=404, detail="Target user not found")

    target_user = normalize_social_fields(target_user)

    source_friends = to_object_id_set(user.get("friend_ids", []))
    source_incoming = to_object_id_set(user.get("friend_request_incoming_ids", []))
    source_outgoing = to_object_id_set(user.get("friend_request_outgoing_ids", []))

    if target_id in source_friends:
        raise HTTPException(status_code=400, detail="You are already friends")
    if target_id in source_outgoing:
        raise HTTPException(status_code=400, detail="Friend request already sent")

    if target_id in source_incoming:
        users_collection.update_one(
            {"_id": source_id},
            {
                "$addToSet": {"friend_ids": target_id},
                "$pull": {
                    "friend_request_incoming_ids": target_id,
                    "friend_request_outgoing_ids": target_id,
                },
            },
        )
        users_collection.update_one(
            {"_id": target_id},
            {
                "$addToSet": {"friend_ids": source_id},
                "$pull": {
                    "friend_request_incoming_ids": source_id,
                    "friend_request_outgoing_ids": source_id,
                },
            },
        )
        return {
            "status": "accepted",
            "detail": "Existing incoming request accepted and friendship created",
            "friend": serialize_user_summary(target_user, "friend"),
        }

    users_collection.update_one(
        {"_id": source_id},
        {"$addToSet": {"friend_request_outgoing_ids": target_id}},
    )
    users_collection.update_one(
        {"_id": target_id},
        {"$addToSet": {"friend_request_incoming_ids": source_id}},
    )

    return {
        "status": "requested",
        "detail": "Friend request sent",
        "user": serialize_user_summary(target_user, "outgoing_request"),
    }


@app.post("/friends/requests/{from_user_id}")
def respond_to_friend_request(
    from_user_id: str,
    req: FriendRequestAction,
    user: dict = Depends(get_current_user),
):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    source_id = parse_object_id(from_user_id, field_name="from_user_id")
    target_id = user["_id"]

    incoming = to_object_id_set(user.get("friend_request_incoming_ids", []))
    if source_id not in incoming:
        raise HTTPException(status_code=400, detail="No incoming request from this user")

    if req.action == "accept":
        users_collection.update_one(
            {"_id": target_id},
            {
                "$addToSet": {"friend_ids": source_id},
                "$pull": {"friend_request_incoming_ids": source_id},
            },
        )
        users_collection.update_one(
            {"_id": source_id},
            {
                "$addToSet": {"friend_ids": target_id},
                "$pull": {"friend_request_outgoing_ids": target_id},
            },
        )
        return {"status": "accepted", "detail": "Friend request accepted"}

    users_collection.update_one(
        {"_id": target_id},
        {"$pull": {"friend_request_incoming_ids": source_id}},
    )
    users_collection.update_one(
        {"_id": source_id},
        {"$pull": {"friend_request_outgoing_ids": target_id}},
    )
    return {"status": "rejected", "detail": "Friend request rejected"}


@app.delete("/friends/requests/{to_user_id}")
def cancel_friend_request(to_user_id: str, user: dict = Depends(get_current_user)):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    target_id = parse_object_id(to_user_id, field_name="to_user_id")
    source_id = user["_id"]

    outgoing = to_object_id_set(user.get("friend_request_outgoing_ids", []))
    if target_id not in outgoing:
        raise HTTPException(status_code=400, detail="No outgoing request for this user")

    users_collection.update_one(
        {"_id": source_id},
        {"$pull": {"friend_request_outgoing_ids": target_id}},
    )
    users_collection.update_one(
        {"_id": target_id},
        {"$pull": {"friend_request_incoming_ids": source_id}},
    )
    return {"status": "cancelled", "detail": "Friend request cancelled"}


@app.delete("/friends/{friend_user_id}")
def unfriend_user(friend_user_id: str, user: dict = Depends(get_current_user)):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    friend_id = parse_object_id(friend_user_id, field_name="friend_user_id")
    user_id = user["_id"]
    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot unfriend yourself")

    current_friends = to_object_id_set(user.get("friend_ids", []))
    if friend_id not in current_friends:
        raise HTTPException(status_code=400, detail="This user is not in your friends list")

    users_collection.update_one(
        {"_id": user_id},
        {
            "$pull": {
                "friend_ids": friend_id,
                "friend_request_incoming_ids": friend_id,
                "friend_request_outgoing_ids": friend_id,
            },
        },
    )
    users_collection.update_one(
        {"_id": friend_id},
        {
            "$pull": {
                "friend_ids": user_id,
                "friend_request_incoming_ids": user_id,
                "friend_request_outgoing_ids": user_id,
            },
        },
    )
    return {"status": "unfriended", "detail": "Friend removed"}


@app.websocket("/ws/realtime")
async def realtime_socket(websocket: WebSocket, token: str = Query(default="")):
    if not token:
        await websocket.close(code=1008, reason="Missing auth token")
        return

    try:
        user = get_user_from_token(token)
    except HTTPException:
        await websocket.close(code=1008, reason="Invalid auth token")
        return

    user_id = str(user["_id"])
    await realtime_hub.connect(user_id, websocket)
    await realtime_hub.send_to_socket(websocket, "realtime.connected", {"user_id": user_id})

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "ping":
                await realtime_hub.send_to_socket(websocket, "realtime.pong", {"ts": datetime.now(timezone.utc).isoformat()})
                continue

            if message_type == "subscribe_match":
                raw_match_id = str(message.get("match_id", "")).strip()
                if not raw_match_id:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "match_id is required"})
                    continue

                try:
                    match_object_id = parse_object_id(raw_match_id, field_name="match_id")
                except HTTPException:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Invalid match_id"})
                    continue

                match_doc = tictactoe_matches_collection.find_one({"_id": match_object_id}) if tictactoe_matches_collection is not None else None
                if match_doc is None or user["_id"] not in set(match_doc.get("player_user_ids", [])):
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Match not found or access denied"})
                    continue

                room = ttt_match_room(raw_match_id)
                realtime_hub.join_room(websocket, room)
                await realtime_hub.send_to_socket(websocket, "realtime.subscribed", {"room": room})
                await realtime_hub.send_to_socket(websocket, "ttt.match.updated", {
                    "match_id": str(match_doc.get("_id")),
                    "status": match_doc.get("status"),
                    "winner": match_doc.get("winner"),
                    "board": match_doc.get("board"),
                    "current_turn": match_doc.get("current_turn"),
                    "updated_at": match_doc.get("updated_at"),
                })
                continue

            if message_type == "unsubscribe_match":
                raw_match_id = str(message.get("match_id", "")).strip()
                if raw_match_id:
                    realtime_hub.leave_room(websocket, ttt_match_room(raw_match_id))
                continue

            if message_type == "subscribe_connect4_match":
                raw_match_id = str(message.get("match_id", "")).strip()
                if not raw_match_id:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "match_id is required"})
                    continue

                try:
                    match_object_id = parse_object_id(raw_match_id, field_name="match_id")
                except HTTPException:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Invalid match_id"})
                    continue

                match_doc = connect4_matches_collection.find_one({"_id": match_object_id}) if connect4_matches_collection is not None else None
                if match_doc is None or user["_id"] not in set(match_doc.get("player_user_ids", [])):
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Match not found or access denied"})
                    continue

                room = c4_match_room(raw_match_id)
                realtime_hub.join_room(websocket, room)
                await realtime_hub.send_to_socket(websocket, "realtime.subscribed", {"room": room})
                await realtime_hub.send_to_socket(websocket, "c4.match.updated", {
                    "match_id": str(match_doc.get("_id")),
                    "status": match_doc.get("status"),
                    "winner": match_doc.get("winner"),
                    "board": match_doc.get("board"),
                    "current_turn": match_doc.get("current_turn"),
                    "updated_at": match_doc.get("updated_at"),
                })
                continue

            if message_type == "unsubscribe_connect4_match":
                raw_match_id = str(message.get("match_id", "")).strip()
                if raw_match_id:
                    realtime_hub.leave_room(websocket, c4_match_room(raw_match_id))
                continue

            if message_type == "ttt_friend_move":
                raw_match_id = str(message.get("match_id", "")).strip()
                try:
                    index = int(message.get("index"))
                except Exception:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Invalid move index"})
                    continue

                try:
                    _, updated = ttt_play_friend_move_internal(raw_match_id, index, user)
                    await publish_ttt_match_event(updated)
                except HTTPException as exc:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": exc.detail})
                continue

            if message_type == "c4_friend_move":
                raw_match_id = str(message.get("match_id", "")).strip()
                try:
                    column = int(message.get("column"))
                except Exception:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Invalid move column"})
                    continue

                try:
                    _, updated = c4_play_friend_move_internal(raw_match_id, column, user)
                    await publish_c4_match_event(updated)
                except HTTPException as exc:
                    await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": exc.detail})
                continue

            await realtime_hub.send_to_socket(websocket, "realtime.error", {"detail": "Unknown message type"})
    except WebSocketDisconnect:
        pass
    finally:
        realtime_hub.disconnect(websocket)


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
        if req.tictactoe_mode is None:
            req.tictactoe_mode = "ai"

        board_cells = len(req.tictactoe_board)
        inferred_size = int(board_cells ** 0.5)
        if inferred_size * inferred_size != board_cells:
            raise HTTPException(status_code=400, detail="tictactoe_board must form a square board")

        if req.tictactoe_board_size is None:
            req.tictactoe_board_size = inferred_size
        if req.tictactoe_board_size * req.tictactoe_board_size != board_cells:
            raise HTTPException(status_code=400, detail="tictactoe_board_size does not match tictactoe_board")
    if req.game_type == "connect4":
        if req.connect4_board is None:
            raise HTTPException(status_code=400, detail="connect4_board is required for connect4 games")
        if req.connect4_player_disc is None:
            raise HTTPException(status_code=400, detail="connect4_player_disc is required for connect4 games")
    if req.game_type == "othello":
        if req.othello_board is None:
            raise HTTPException(status_code=400, detail="othello_board is required for othello games")
        if req.othello_player_disc is None:
            raise HTTPException(status_code=400, detail="othello_player_disc is required for othello games")
    if req.game_type == "minesweeper":
        if req.minesweeper_board is None:
            raise HTTPException(status_code=400, detail="minesweeper_board is required for minesweeper games")
        if req.minesweeper_revealed is None:
            raise HTTPException(status_code=400, detail="minesweeper_revealed is required for minesweeper games")
        if req.minesweeper_flagged is None:
            raise HTTPException(status_code=400, detail="minesweeper_flagged is required for minesweeper games")
    if req.game_type == "2048":
        if req.game_2048_board is None:
            raise HTTPException(status_code=400, detail="game_2048_board is required for 2048 games")
        if req.game_2048_score is None:
            raise HTTPException(status_code=400, detail="game_2048_score is required for 2048 games")
        if req.game_2048_moves is None:
            raise HTTPException(status_code=400, detail="game_2048_moves is required for 2048 games")

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
            "tictactoe_mode": req.tictactoe_mode,
            "tictactoe_board_size": req.tictactoe_board_size,
        })
    elif req.game_type == "connect4":
        payload.update({
            "connect4_board": req.connect4_board,
            "connect4_player_disc": req.connect4_player_disc,
            "connect4_winner": req.connect4_winner,
            "connect4_move_history": req.connect4_move_history,
            "connect4_elapsed_seconds": req.connect4_elapsed_seconds,
        })
    elif req.game_type == "othello":
        payload.update({
            "othello_board": req.othello_board,
            "othello_player_disc": req.othello_player_disc,
            "othello_winner": req.othello_winner,
            "othello_move_history": req.othello_move_history,
            "othello_elapsed_seconds": req.othello_elapsed_seconds,
        })
    elif req.game_type == "2048":
        payload.update({
            "game_2048_board": req.game_2048_board,
            "game_2048_score": req.game_2048_score,
            "game_2048_moves": req.game_2048_moves,
            "game_2048_max_tile": req.game_2048_max_tile,
            "game_2048_elapsed_seconds": req.game_2048_elapsed_seconds,
        })
    else:  # minesweeper
        payload.update({
            "minesweeper_board": req.minesweeper_board,
            "minesweeper_mines": req.minesweeper_mines,
            "minesweeper_revealed": req.minesweeper_revealed,
            "minesweeper_flagged": req.minesweeper_flagged,
            "minesweeper_winner": req.minesweeper_winner,
            "minesweeper_elapsed_seconds": req.minesweeper_elapsed_seconds,
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


@app.post("/othello/best-move")
def othello_best_move(req: OthelloBestMoveRequest):
    return {
        **pick_othello_move(req.board, req.difficulty, req.ai_disc),
        "difficulty": req.difficulty,
    }

@app.post("/minesweeper/new", response_model=MinesweeperCreateResponse)
def minesweeper_new(req: MinesweeperCreateRequest):
    board, mines = generate_minesweeper_board(req.board_size)
    config = MINESWEEPER_CONFIG[req.board_size]
    return {
        "board": board,
        "mines": mines,
        "rows": config["rows"],
        "cols": config["cols"],
        "mine_count": config["mines"],
        "board_size": req.board_size,
    }

@app.post("/best-move")
def best_move(req: BestMoveRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="Chess engine is unavailable on this server")

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