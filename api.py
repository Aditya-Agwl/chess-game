import os
from typing import Literal
import chess
import chess.engine
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STOCKFISH_PATH = os.getenv(
    "STOCKFISH_PATH",
    "C:/Users/hp/Desktop/stockfish/stockfish/stockfish-windows-x86-64-avx2.exe"
)

engine = None

DifficultyLevel = Literal["easy", "medium", "hard"]

DIFFICULTY_PROFILES = {
    "easy": {
        "time": 0.05,
        "skill": 2,
        "elo": 1320,
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


def configure_engine_for_difficulty(level: DifficultyLevel):
    profile = DIFFICULTY_PROFILES[level]
    engine.configure({
        "UCI_LimitStrength": True,
        "UCI_Elo": profile["elo"],
        "Skill Level": profile["skill"],
    })

@app.on_event("startup")
def startup():
    global engine
    if not os.path.exists(STOCKFISH_PATH):
        raise RuntimeError(f"Stockfish not found at: {STOCKFISH_PATH}")
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

@app.on_event("shutdown")
def shutdown():
    global engine
    if engine is not None:
        engine.quit()

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