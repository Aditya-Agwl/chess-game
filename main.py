import chess
import chess.engine

# 1. Set the path to the Stockfish executable you downloaded
# Replace this string with the actual path on your computer!
# Windows example: "C:/users/yourname/downloads/stockfish/stockfish-windows.exe"
# Mac/Linux example: "/usr/local/bin/stockfish" or "./stockfish"
STOCKFISH_PATH = "C:/Users/hp/Desktop/stockfish/stockfish/stockfish-windows-x86-64-avx2.exe"

def get_best_move(fen_string):
    try:
        # 2. Set up the board using a FEN string
        # FEN represents the exact layout of the pieces on the board
        board = chess.Board(fen_string)

        # 3. Spin up the Stockfish engine
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            
            # 4. Ask Stockfish for the best move
            # We limit its thinking time to 0.1 seconds to keep the backend fast.
            # You can also limit it by depth (e.g., chess.engine.Limit(depth=15))
            result = engine.play(board, chess.engine.Limit(time=0.1))
            
            best_move = result.move
            print(f"Current Board:\n{board}\n")
            print(f"Stockfish says the best move is: {best_move}")
            
            return str(best_move)

    except FileNotFoundError:
        print("Error: Could not find Stockfish. Please check your STOCKFISH_PATH.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Example usage: passing the starting position of a chess game
    starting_position_fen = chess.STARTING_FEN
    get_best_move(starting_position_fen)
