import os
import chess
import main


def test_get_best_move_starting_position_returns_legal_move():
    # Skip integration test if Stockfish binary does not exist.
    if not os.path.exists(main.STOCKFISH_PATH):
        import pytest
        pytest.skip("Stockfish executable not found at configured path")

    move_uci = main.get_best_move(chess.STARTING_FEN)

    assert move_uci is not None
    move = chess.Move.from_uci(move_uci)
    board = chess.Board(chess.STARTING_FEN)
    assert move in board.legal_moves


def test_get_best_move_invalid_fen_returns_none():
    result = main.get_best_move("invalid_fen")
    assert result is None