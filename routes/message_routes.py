from __future__ import annotations

from flask import Blueprint, jsonify

from services.db_service import get_connection
from services.message_service import (
    delete_all_messages,
    delete_message,
    get_unread_count,
    get_user_messages,
    mark_all_as_read,
    mark_message_as_read,
)
from utils.auth import require_user_access

message_bp = Blueprint("message_bp", __name__)


def _extract_message_id(payload: dict) -> int | None:
    value = payload.get("message_id") or payload.get("id")
    if value in (None, ""):
        return None
    try:
        return int(value)
    except Exception:
        return None


@message_bp.post("/api/messages")
def fetch_messages():
    user, _payload, error = require_user_access()
    if error:
        return error

    with get_connection() as conn:
        messages = get_user_messages(conn, user["user_id"])
        unread = get_unread_count(conn, user["user_id"])

    return jsonify(
        {
            "success": True,
            "messages": messages,
            "unread": unread,
        }
    )


@message_bp.post("/api/messages/read")
def read_message():
    user, payload, error = require_user_access()
    if error:
        return error

    message_id = _extract_message_id(payload)
    if not message_id:
        return jsonify({"success": False, "message": "Missing message_id"}), 400

    with get_connection() as conn:
        marked = mark_message_as_read(conn, user["user_id"], message_id)
        unread = get_unread_count(conn, user["user_id"])

    return jsonify(
        {
            "success": True,
            "marked": marked,
            "unread": unread,
        }
    )


@message_bp.post("/api/messages/read-all")
def read_all():
    user, _payload, error = require_user_access()
    if error:
        return error

    with get_connection() as conn:
        changed = mark_all_as_read(conn, user["user_id"])
        unread = get_unread_count(conn, user["user_id"])

    return jsonify(
        {
            "success": True,
            "updated": changed,
            "unread": unread,
        }
    )


@message_bp.post("/api/messages/delete")
def delete_one():
    user, payload, error = require_user_access()
    if error:
        return error

    message_id = _extract_message_id(payload)
    if not message_id:
        return jsonify({"success": False, "message": "Missing message_id"}), 400

    with get_connection() as conn:
        deleted = delete_message(conn, user["user_id"], message_id)
        unread = get_unread_count(conn, user["user_id"])

    return jsonify(
        {
            "success": True,
            "deleted": deleted,
            "unread": unread,
        }
    )


@message_bp.post("/api/messages/delete-all")
def delete_all():
    user, _payload, error = require_user_access()
    if error:
        return error

    with get_connection() as conn:
        deleted = delete_all_messages(conn, user["user_id"])

    return jsonify(
        {
            "success": True,
            "deleted": deleted,
            "unread": 0,
        }
    )
