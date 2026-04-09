import type { DifficultyLevel, GameResult, SocialUser } from "../types";

export type Connect4Disc = "R" | "Y";
export type Connect4Winner = Connect4Disc | "draw";
export type Connect4Mode = "local" | "ai" | "friend";

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

export function ensureConnect4Realtime(apiBase: string, authToken: string): void {
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
        ensureConnect4Realtime(base, token);
      }
    }, 1500);
  };
}

export function subscribeConnect4Realtime(listener: (message: RealtimeEnvelope) => void): () => void {
  realtimeListeners.add(listener);
  return () => {
    realtimeListeners.delete(listener);
  };
}

export function sendConnect4RealtimeMessage(message: Record<string, unknown>): boolean {
  if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  realtimeSocket.send(JSON.stringify(message));
  return true;
}

export type Connect4BestMoveRequest = {
  board: string;
  difficulty: DifficultyLevel;
  ai_disc: Connect4Disc;
};

export type Connect4BestMoveResponse = {
  column: number;
  difficulty: DifficultyLevel;
};

export type Connect4SavePayload = {
  game_type: "connect4";
  result: GameResult;
  difficulty: DifficultyLevel;
  connect4_board: string;
  connect4_player_disc: Connect4Disc;
  connect4_winner?: Connect4Winner;
  connect4_move_history: string[];
  connect4_elapsed_seconds: number;
  started_at: string;
  finished_at: string;
};

export type Connect4Invite = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at?: string;
  responded_at?: string;
  match_id?: string | null;
  counterpart?: SocialUser | null;
  direction: "incoming" | "outgoing";
};

export type Connect4InvitesResponse = {
  incoming_pending: Connect4Invite[];
  outgoing_pending: Connect4Invite[];
  accepted_matches: Connect4Invite[];
  accepted_matches_upcoming?: Connect4Invite[];
  accepted_matches_completed?: Connect4Invite[];
  incoming_count: number;
};

export type Connect4FriendMatch = {
  id: string;
  status: "ongoing" | "finished";
  board: string;
  current_turn: Connect4Disc;
  winner: Connect4Winner | null;
  move_history: string[];
  my_disc: Connect4Disc;
  inviter_user_id: string;
  invitee_user_id: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
};

export async function fetchConnect4BestMove(
  apiBase: string,
  payload: Connect4BestMoveRequest,
): Promise<Connect4BestMoveResponse> {
  return requestJson<Connect4BestMoveResponse>(`${apiBase}/connect4/best-move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function saveConnect4Game(
  apiBase: string,
  authToken: string,
  payload: Connect4SavePayload,
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

export async function fetchFriendsForConnect4Invite(apiBase: string, authToken: string): Promise<SocialUser[]> {
  const data = await requestJson<{ friends?: SocialUser[] }>(`${apiBase}/friends`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  return data.friends ?? [];
}

export async function sendConnect4FriendInvite(
  apiBase: string,
  authToken: string,
  targetUserId: string,
): Promise<{ status: string; detail: string }> {
  return requestJson<{ status: string; detail: string }>(`${apiBase}/connect4/friend-invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      target_user_id: targetUserId,
    }),
  });
}

export async function fetchConnect4FriendInvites(apiBase: string, authToken: string): Promise<Connect4InvitesResponse> {
  return requestJson<Connect4InvitesResponse>(`${apiBase}/connect4/friend-invites`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function cancelConnect4FriendInvite(
  apiBase: string,
  authToken: string,
  inviteId: string,
): Promise<{ status: string; detail: string }> {
  return requestJson<{ status: string; detail: string }>(`${apiBase}/connect4/friend-invites/${inviteId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function respondConnect4FriendInvite(
  apiBase: string,
  authToken: string,
  inviteId: string,
  action: "accept" | "reject",
): Promise<{ status: string; detail: string; match?: Connect4FriendMatch }> {
  return requestJson<{ status: string; detail: string; match?: Connect4FriendMatch }>(
    `${apiBase}/connect4/friend-invites/${inviteId}/respond`,
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

export async function fetchConnect4FriendMatch(
  apiBase: string,
  authToken: string,
  matchId: string,
): Promise<Connect4FriendMatch> {
  return requestJson<Connect4FriendMatch>(`${apiBase}/connect4/friend-matches/${matchId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

export async function playConnect4FriendMove(
  apiBase: string,
  authToken: string,
  matchId: string,
  column: number,
): Promise<Connect4FriendMatch> {
  return requestJson<Connect4FriendMatch>(`${apiBase}/connect4/friend-matches/${matchId}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ column }),
  });
}
