import os
from datetime import datetime, timedelta, timezone
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
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://d12uyfju5i7sl1.cloudfront.net",
        "https://chess.agarwaladi.co.in",
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
    result: GameResult
    difficulty: DifficultyLevel
    player_color: PlayerColor
    time_control: TimeControl | None = None
    initial_seconds: int | None = None
    increment_seconds: int | None = None
    white_time_left_ms: int | None = None
    black_time_left_ms: int | None = None
    timeout_loser: PlayerColor | None = None
    final_fen: str
    move_history: list[str]
    pgn: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


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
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "created_at": doc.get("created_at"),
    }


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

    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user["_id"],
        "result": req.result,
        "difficulty": req.difficulty,
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
        "started_at": req.started_at or now,
        "finished_at": req.finished_at or now,
        "created_at": now,
    }
    inserted = games_collection.insert_one(payload)
    return {"id": str(inserted.inserted_id)}


@app.get("/games")
def list_games(limit: int = 20, user: dict = Depends(get_current_user)):
    if games_collection is None:
        raise HTTPException(status_code=500, detail="Database is not configured")

    safe_limit = max(1, min(limit, 100))
    docs = games_collection.find({"user_id": user["_id"]}).sort("finished_at", DESCENDING).limit(safe_limit)
    return {"games": [serialize_game(doc) for doc in docs]}

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