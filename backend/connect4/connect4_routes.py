from datetime import datetime, timezone
from typing import Any, Callable

from bson import ObjectId
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import DESCENDING

from .connect4_logic import (
    connect4_available_columns,
    connect4_board_from_string,
    connect4_board_to_string,
    connect4_drop_disc,
    connect4_winner,
    pick_connect4_move,
    split_accepted_invites_by_match_status,
)


class Connect4BestMoveRequest(BaseModel):
    board: str
    difficulty: str = "medium"
    ai_disc: str = "Y"


class Connect4InviteCreateRequest(BaseModel):
    target_user_id: str


class Connect4InviteActionRequest(BaseModel):
    action: str


class Connect4FriendMoveRequest(BaseModel):
    column: int = Field(ge=0, le=6)


def c4_match_room(match_id: ObjectId | str) -> str:
    return f"c4:match:{str(match_id)}"


def build_connect4_handlers(ctx: dict[str, Any]) -> dict[str, Callable]:
    get_current_user = ctx["get_current_user"]
    parse_object_id = ctx["parse_object_id"]
    serialize_user_summary = ctx["serialize_user_summary"]

    def users_collection():
        return ctx["get_users_collection"]()

    def invites_collection():
        return ctx["get_invites_collection"]()

    def matches_collection():
        return ctx["get_matches_collection"]()

    def games_collection():
        return ctx["get_games_collection"]()

    async def publish_invite_event(invite_doc: dict, event: str):
        await ctx["publish_invite_event"](invite_doc, event)

    async def publish_match_event(match_doc: dict):
        await ctx["publish_match_event"](match_doc)

    def _to_object_id_set(values: list) -> set[ObjectId]:
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

    def _connect4_counterpart(current_user_id: ObjectId, from_user_id: ObjectId, to_user_id: ObjectId) -> ObjectId:
        return to_user_id if current_user_id == from_user_id else from_user_id

    def _serialize_connect4_invite(invite_doc: dict, current_user_id: ObjectId) -> dict:
        from_id = invite_doc.get("from_user_id")
        to_id = invite_doc.get("to_user_id")
        counterpart_id = _connect4_counterpart(current_user_id, from_id, to_id)
        counterpart_doc = users_collection().find_one({"_id": counterpart_id}) if users_collection() is not None else None

        return {
            "id": str(invite_doc["_id"]),
            "from_user_id": str(from_id),
            "to_user_id": str(to_id),
            "status": invite_doc.get("status", "pending"),
            "created_at": invite_doc.get("created_at"),
            "responded_at": invite_doc.get("responded_at"),
            "match_id": str(invite_doc["match_id"]) if invite_doc.get("match_id") else None,
            "counterpart": serialize_user_summary(counterpart_doc) if counterpart_doc else None,
            "direction": "outgoing" if current_user_id == from_id else "incoming",
        }

    def _serialize_connect4_match(match_doc: dict, current_user_id: ObjectId) -> dict:
        inviter_id = match_doc.get("inviter_id")
        my_disc = "R" if current_user_id == inviter_id else "Y"

        return {
            "id": str(match_doc["_id"]),
            "status": match_doc.get("status", "ongoing"),
            "board": match_doc.get("board"),
            "current_turn": match_doc.get("current_turn", "R"),
            "winner": match_doc.get("winner"),
            "move_history": match_doc.get("move_history", []),
            "my_disc": my_disc,
            "inviter_user_id": str(inviter_id),
            "invitee_user_id": str(match_doc.get("invitee_id")),
            "created_at": match_doc.get("created_at"),
            "updated_at": match_doc.get("updated_at"),
            "finished_at": match_doc.get("finished_at"),
        }

    def _persist_finished_friend_match(match_doc: dict):
        if games_collection() is None:
            return

        winner = match_doc.get("winner")
        board = match_doc.get("board")
        history = match_doc.get("move_history", [])
        started_at = match_doc.get("created_at") or datetime.now(timezone.utc)
        finished_at = match_doc.get("finished_at") or datetime.now(timezone.utc)

        for user_id, player_disc in [
            (match_doc.get("inviter_id"), "R"),
            (match_doc.get("invitee_id"), "Y"),
        ]:
            if user_id is None:
                continue

            if winner == "draw":
                result = "draw"
            elif winner == player_disc:
                result = "win"
            else:
                result = "loss"

            games_collection().insert_one({
                "user_id": user_id,
                "game_type": "connect4",
                "result": result,
                "difficulty": "medium",
                "connect4_board": board,
                "connect4_player_disc": player_disc,
                "connect4_winner": winner,
                "connect4_move_history": history,
                "connect4_elapsed_seconds": None,
                "started_at": started_at,
                "finished_at": finished_at,
                "created_at": datetime.now(timezone.utc),
                "connect4_match_id": match_doc.get("_id"),
            })

    def play_connect4_friend_move_internal(match_id: str, column: int, user: dict) -> tuple[dict, dict]:
        if matches_collection() is None:
            raise HTTPException(status_code=500, detail="Database is not configured")

        match_object_id = parse_object_id(match_id, field_name="match_id")
        match_doc = matches_collection().find_one({"_id": match_object_id})
        if match_doc is None:
            raise HTTPException(status_code=404, detail="Match not found")

        inviter_id = match_doc.get("inviter_id")
        invitee_id = match_doc.get("invitee_id")
        user_id = user["_id"]

        if user_id == inviter_id:
            player_disc = "R"
        elif user_id == invitee_id:
            player_disc = "Y"
        else:
            raise HTTPException(status_code=403, detail="You are not a player in this match")

        if match_doc.get("status") != "ongoing":
            raise HTTPException(status_code=400, detail="Match already finished")
        if match_doc.get("current_turn") != player_disc:
            raise HTTPException(status_code=400, detail="It is not your turn")

        board = connect4_board_from_string(match_doc.get("board", ""))
        if column not in connect4_available_columns(board):
            raise HTTPException(status_code=400, detail="Column is full")

        dropped = connect4_drop_disc(board, column, player_disc)
        if dropped is None:
            raise HTTPException(status_code=400, detail="Invalid move")
        next_board, _ = dropped

        now = datetime.now(timezone.utc)
        move_history = [*match_doc.get("move_history", []), f"{player_disc} -> C{column + 1}"]

        winner = connect4_winner(next_board)
        status = "ongoing"
        next_turn = "Y" if player_disc == "R" else "R"
        finished_at = None

        if winner is not None:
            status = "finished"
            next_turn = match_doc.get("current_turn", "R")
            finished_at = now
        elif not connect4_available_columns(next_board):
            winner = "draw"
            status = "finished"
            next_turn = match_doc.get("current_turn", "R")
            finished_at = now

        matches_collection().update_one(
            {"_id": match_object_id},
            {
                "$set": {
                    "board": connect4_board_to_string(next_board),
                    "current_turn": next_turn,
                    "winner": winner,
                    "status": status,
                    "move_history": move_history,
                    "updated_at": now,
                    "finished_at": finished_at,
                }
            },
        )

        updated = matches_collection().find_one({"_id": match_object_id})
        if status == "finished":
            _persist_finished_friend_match(updated)

        return _serialize_connect4_match(updated, user_id), updated

    def register(app):
        @app.get("/connect4/friend-invites")
        def connect4_friend_invites(user: dict = Depends(get_current_user)):
            if invites_collection() is None:
                raise HTTPException(status_code=500, detail="Database is not configured")

            user_id = user["_id"]
            incoming_docs = list(
                invites_collection().find({"to_user_id": user_id}).sort("created_at", DESCENDING).limit(50)
            )
            outgoing_docs = list(
                invites_collection().find({"from_user_id": user_id}).sort("created_at", DESCENDING).limit(50)
            )

            incoming = [_serialize_connect4_invite(doc, user_id) for doc in incoming_docs]
            outgoing = [_serialize_connect4_invite(doc, user_id) for doc in outgoing_docs]

            incoming_pending = [item for item in incoming if item["status"] == "pending"]
            outgoing_pending = [item for item in outgoing if item["status"] == "pending"]
            accepted_matches = [item for item in incoming + outgoing if item["status"] == "accepted" and item["match_id"]]

            match_status_by_id: dict[str, str] = {}
            if matches_collection() is not None and accepted_matches:
                accepted_match_ids: list[ObjectId] = []
                for invite in accepted_matches:
                    raw_match_id = invite.get("match_id")
                    if not raw_match_id:
                        continue
                    try:
                        accepted_match_ids.append(ObjectId(str(raw_match_id)))
                    except Exception:
                        continue

                if accepted_match_ids:
                    for match_doc in matches_collection().find(
                        {"_id": {"$in": accepted_match_ids}},
                        {"status": 1},
                    ):
                        match_status_by_id[str(match_doc.get("_id"))] = match_doc.get("status", "ongoing")

            accepted_matches_upcoming, accepted_matches_completed = split_accepted_invites_by_match_status(
                accepted_matches,
                match_status_by_id,
            )

            return {
                "incoming_pending": incoming_pending,
                "outgoing_pending": outgoing_pending,
                "accepted_matches": accepted_matches_upcoming,
                "accepted_matches_upcoming": accepted_matches_upcoming,
                "accepted_matches_completed": accepted_matches_completed,
                "incoming_count": len(incoming_pending),
            }

        @app.post("/connect4/friend-invites")
        async def create_connect4_friend_invite(req: Connect4InviteCreateRequest, user: dict = Depends(get_current_user)):
            if users_collection() is None or invites_collection() is None:
                raise HTTPException(status_code=500, detail="Database is not configured")

            source_id = user["_id"]
            target_id = parse_object_id(req.target_user_id, field_name="target_user_id")

            if source_id == target_id:
                raise HTTPException(status_code=400, detail="You cannot invite yourself")

            source_friends = _to_object_id_set(user.get("friend_ids", []))
            if target_id not in source_friends:
                raise HTTPException(status_code=400, detail="You can invite only users in your friends list")

            existing_pending = invites_collection().find_one({
                "status": "pending",
                "$or": [
                    {"from_user_id": source_id, "to_user_id": target_id},
                    {"from_user_id": target_id, "to_user_id": source_id},
                ],
            })
            if existing_pending is not None:
                raise HTTPException(status_code=400, detail="There is already a pending Connect 4 invite between you two")

            now = datetime.now(timezone.utc)
            created = {
                "from_user_id": source_id,
                "to_user_id": target_id,
                "status": "pending",
                "created_at": now,
                "responded_at": None,
                "match_id": None,
            }
            insert = invites_collection().insert_one(created)
            created["_id"] = insert.inserted_id

            await publish_invite_event(created, "c4.invite.created")

            return {
                "status": "requested",
                "detail": "Connect 4 invite sent",
                "invite": _serialize_connect4_invite(created, source_id),
            }

        @app.delete("/connect4/friend-invites/{invite_id}")
        async def cancel_connect4_friend_invite(invite_id: str, user: dict = Depends(get_current_user)):
            if invites_collection() is None:
                raise HTTPException(status_code=500, detail="Database is not configured")

            invite_object_id = parse_object_id(invite_id, field_name="invite_id")
            invite = invites_collection().find_one({"_id": invite_object_id})
            if invite is None:
                raise HTTPException(status_code=404, detail="Invite not found")
            if invite.get("from_user_id") != user["_id"]:
                raise HTTPException(status_code=403, detail="Only sender can cancel this invite")
            if invite.get("status") != "pending":
                raise HTTPException(status_code=400, detail="Only pending invites can be cancelled")

            invites_collection().update_one(
                {"_id": invite_object_id},
                {"$set": {"status": "cancelled", "responded_at": datetime.now(timezone.utc)}},
            )
            updated_invite = invites_collection().find_one({"_id": invite_object_id})
            await publish_invite_event(updated_invite, "c4.invite.updated")
            return {"status": "cancelled", "detail": "Invite cancelled"}

        @app.post("/connect4/friend-invites/{invite_id}/respond")
        async def respond_connect4_friend_invite(
            invite_id: str,
            req: Connect4InviteActionRequest,
            user: dict = Depends(get_current_user),
        ):
            if invites_collection() is None or matches_collection() is None:
                raise HTTPException(status_code=500, detail="Database is not configured")

            if req.action not in {"accept", "reject"}:
                raise HTTPException(status_code=400, detail="Invalid action")

            invite_object_id = parse_object_id(invite_id, field_name="invite_id")
            invite = invites_collection().find_one({"_id": invite_object_id})
            if invite is None:
                raise HTTPException(status_code=404, detail="Invite not found")
            if invite.get("to_user_id") != user["_id"]:
                raise HTTPException(status_code=403, detail="Only invite receiver can respond")
            if invite.get("status") != "pending":
                raise HTTPException(status_code=400, detail="Invite is no longer pending")

            if req.action == "reject":
                invites_collection().update_one(
                    {"_id": invite_object_id},
                    {"$set": {"status": "rejected", "responded_at": datetime.now(timezone.utc)}},
                )
                updated_invite = invites_collection().find_one({"_id": invite_object_id})
                await publish_invite_event(updated_invite, "c4.invite.updated")
                return {"status": "rejected", "detail": "Invite rejected"}

            now = datetime.now(timezone.utc)
            match_doc = {
                "invite_id": invite_object_id,
                "inviter_id": invite.get("from_user_id"),
                "invitee_id": invite.get("to_user_id"),
                "player_user_ids": [invite.get("from_user_id"), invite.get("to_user_id")],
                "board": "-" * 42,
                "current_turn": "R",
                "status": "ongoing",
                "winner": None,
                "move_history": [],
                "created_at": now,
                "updated_at": now,
                "finished_at": None,
            }
            insert = matches_collection().insert_one(match_doc)
            match_id = insert.inserted_id

            invites_collection().update_one(
                {"_id": invite_object_id},
                {"$set": {"status": "accepted", "responded_at": now, "match_id": match_id}},
            )

            updated_invite = invites_collection().find_one({"_id": invite_object_id})
            created_match = matches_collection().find_one({"_id": match_id})
            await publish_invite_event(updated_invite, "c4.invite.updated")
            await publish_match_event(created_match)
            return {
                "status": "accepted",
                "detail": "Invite accepted. Match started.",
                "match": _serialize_connect4_match(created_match, user["_id"]),
            }

        @app.get("/connect4/friend-matches/{match_id}")
        def get_connect4_friend_match(match_id: str, user: dict = Depends(get_current_user)):
            if matches_collection() is None:
                raise HTTPException(status_code=500, detail="Database is not configured")

            match_object_id = parse_object_id(match_id, field_name="match_id")
            match_doc = matches_collection().find_one({"_id": match_object_id})
            if match_doc is None:
                raise HTTPException(status_code=404, detail="Match not found")

            if user["_id"] not in set(match_doc.get("player_user_ids", [])):
                raise HTTPException(status_code=403, detail="You are not a player in this match")

            return _serialize_connect4_match(match_doc, user["_id"])

        @app.post("/connect4/friend-matches/{match_id}/move")
        async def play_connect4_friend_move(
            match_id: str,
            req: Connect4FriendMoveRequest,
            user: dict = Depends(get_current_user),
        ):
            serialized, updated = play_connect4_friend_move_internal(match_id, req.column, user)
            await publish_match_event(updated)
            return serialized

        @app.post("/connect4/best-move")
        def connect4_best_move(req: Connect4BestMoveRequest):
            ai_column = pick_connect4_move(req.board, req.difficulty, req.ai_disc)
            return {
                "column": ai_column,
                "difficulty": req.difficulty,
            }

    return {
        "register": register,
        "match_room": c4_match_room,
        "play_friend_move_internal": play_connect4_friend_move_internal,
    }
