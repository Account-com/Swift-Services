from flask import Blueprint, jsonify, request

from services.activity_feed_service import (
    get_activity_feed,
    get_user_achievement_summary,
)
from services.db_service import get_connection
from utils.auth import json_error as auth_json_error, require_user_access

activity_bp = Blueprint("activity_bp", __name__)


def _json_error(message: str, status_code: int = 400):
    return auth_json_error(message, status_code)


@activity_bp.post("/api/activity-feed")
def activity_feed():
    data = request.get_json(silent=True) or {}
    limit = int(data.get("limit", 12))

    with get_connection() as conn:
        items = get_activity_feed(conn, limit=limit)

    return jsonify({"success": True, "items": items})


@activity_bp.post("/api/achievements")
def achievements():
    data = request.get_json(silent=True) or {}
    user, _payload, error = require_user_access(data=data)
    if error:
        return error

    with get_connection() as conn:
        badges = get_user_achievement_summary(conn, user["user_id"])

    return jsonify({"success": True, "badges": badges})
