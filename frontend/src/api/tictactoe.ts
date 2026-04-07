import type { DifficultyLevel, GameResult, SocialUser } from "../types";

export type TicTacToeMark = "X" | "O";
export type TicTacToeWinner = TicTacToeMark | "draw";
export type TicTacToeMode = "local" | "ai" | "friend";

export type RealtimeEnvelope = {
  event: string;
  payload: Record<string, unknown>;
};

let realtimeSocket: WebSocket | null = null;
let realtimeToken: string | null = null;
let realtimeBase: string | null = null;
const realtimeListeners = new Set<(message: RealtimeEnvelope) => void>();

async function parseResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await parseResponseJson(response);

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new Error(detail);
  }

  return payload as T;
}

function toRealtimeUrl(apiBase: string, token: string): string {
  const base = apiBase.replace(/\/$/, "");
  const wsBase = base.startsWith("https://") ? `wss://${base.slice(8)}` : base.startsWith("http://") ? `ws://${base.slice(7)}` : base;
  return `${wsBase}/ws/realtime?token=${encodeURIComponent(token)}`;
}

export function ensureTicTacToeRealtime(apiBase: string, authToken: string): void {
  if (!authToken) return;

  const shouldReuse =
    realtimeSocket &&
    realtimeSocket.readyState !== WebSocket.CLOSED &&
    realtimeToken === authToken &&
    realtimeBase === apiBase;

  if (shouldReuse) return;

  if (realtimeSocket && realtimeSocket.readyState !== WebSocket.CLOSED) {
    realtimeSocket.close();
  }

  realtimeToken = authToken;
  realtimeBase = apiBase;
  const socket = new WebSocket(toRealtimeUrl(apiBase, authToken));
  realtimeSocket = socket;

  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as RealtimeEnvelope;
      for (const listener of realtimeListeners) {
        listener(parsed);
      }
    } catch {
      // Ignore malformed realtime payloads.
    }
  };

  socket.onclose = () => {
    if (realtimeSocket !== socket) return;

    const token = realtimeToken;
    const base = realtimeBase;
    if (!token || !base) return;

    window.setTimeout(() => {
      if (realtimeSocket === socket) {
        ensureTicTacToeRealtime(base, token);
      }
    }, 1500);
  };
}

export function subscribeTicTacToeRealtime(listener: (message: RealtimeEnvelope) => void): () => void {
  realtimeListeners.add(listener);
  return () => {
    realtimeListeners.delete(listener);
  };
}

export function sendTicTacToeRealtimeMessage(message: Record<string, unknown>): boolean {
  if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  realtimeSocket.send(JSON.stringify(message));
  return true;
}

export type TicTacToeBestMoveRequest = {
  board: string;
  difficulty: DifficultyLevel;
  ai_mark: TicTacToeMark;
  board_size: number;
};

export type TicTacToeBestMoveResponse = {
  index: number;
  difficulty: DifficultyLevel;
  board_size: number;
};

export type TicTacToeSavePayload = {
  game_type: "tictactoe";
  result: GameResult;
  difficulty: DifficultyLevel;
  tictactoe_board: string;
  tictactoe_player_mark: TicTacToeMark;
  tictactoe_winner?: TicTacToeWinner;
  tictactoe_move_history: string[];
  tictactoe_elapsed_seconds: number;
  tictactoe_mode: TicTacToeMode;
  tictactoe_board_size: number;
  started_at: string;
  finished_at: string;
};

export type TicTacToeInvite = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  board_size: number;
  created_at?: string;
  responded_at?: string;
  match_id?: string | null;
  counterpart?: SocialUser | null;
  direction: "incoming" | "outgoing";
};

export type TicTacToeInvitesResponse = {
  incoming_pending: TicTacToeInvite[];
  outgoing_pending: TicTacToeInvite[];
  accepted_matches: TicTacToeInvite[];
  accepted_matches_upcoming?: TicTacToeInvite[];
  accepted_matches_completed?: TicTacToeInvite[];
  incoming_count: number;
};

export type TicTacToeFriendMatch = {
  id: string;
  status: "ongoing" | "finished";
  board_size: number;
  board: string;
  current_turn: TicTacToeMark;
  winner: TicTacToeWinner | null;
  move_history: string[];
  my_mark: TicTacToeMark;
  inviter_user_id: string;
  invitee_user_id: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
};

export async function fetchTicTacToeBestMove(
  apiBase: string,
  payload: TicTacToeBestMoveRequest,
): Promise<TicTacToeBestMoveResponse> {
  return requestJson<TicTacToeBestMoveResponse>(`${apiBase}/tictactoe/best-move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function saveTicTacToeGame(
  apiBase: string,
  authToken: string,
  payload: TicTacToeSavePayload,
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`${apiBase}/games`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchFriendsForTicTacToeInvite(apiBase: string, authToken: string): Promise<SocialUser[]> {
  const data = await requestJson<{ friends?: SocialUser[] }>(`${apiBase}/friends`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  return data.friends ?? [];
}

export async function sendTicTacToeFriendInvite(
  apiBase: string,
  authToken: string,
  targetUserId: string,
  boardSize: number,
): Promise<{ status: string; detail: string }> {
  return requestJson<{ status: string; detail: string }>(`${apiBase}/tictactoe/friend-invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      target_user_id: targetUserId,
      board_size: boardSize,
    }),
  });
}

export async function fetchTicTacToeFriendInvites(apiBase: string, authToken: string): Promise<TicTacToeInvitesResponse> {
  return requestJson<TicTacToeInvitesResponse>(`${apiBase}/tictactoe/friend-invites`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function cancelTicTacToeFriendInvite(
  apiBase: string,
  authToken: string,
  inviteId: string,
): Promise<{ status: string; detail: string }> {
  return requestJson<{ status: string; detail: string }>(`${apiBase}/tictactoe/friend-invites/${inviteId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function respondTicTacToeFriendInvite(
  apiBase: string,
  authToken: string,
  inviteId: string,
  action: "accept" | "reject",
): Promise<{ status: string; detail: string; match?: TicTacToeFriendMatch }> {
  return requestJson<{ status: string; detail: string; match?: TicTacToeFriendMatch }>(
    `${apiBase}/tictactoe/friend-invites/${inviteId}/respond`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ action }),
    },
  );
}

export async function fetchTicTacToeFriendMatch(
  apiBase: string,
  authToken: string,
  matchId: string,
): Promise<TicTacToeFriendMatch> {
  return requestJson<TicTacToeFriendMatch>(`${apiBase}/tictactoe/friend-matches/${matchId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function playTicTacToeFriendMove(
  apiBase: string,
  authToken: string,
  matchId: string,
  index: number,
): Promise<TicTacToeFriendMatch> {
  return requestJson<TicTacToeFriendMatch>(`${apiBase}/tictactoe/friend-matches/${matchId}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ index }),
  });
}
