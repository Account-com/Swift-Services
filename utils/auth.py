from __future__ import annotations

from flask import jsonify, request, session

from services.db_service import get_connection

ACCOUNT_STATUS_BLOCKED = "blocked"
PERMISSION_FIELD_MAP = {
    "tasks": "can_tasks",
    "deposit": "can_deposit",
    "withdraw": "can_withdraw",
}
PERMISSION_LABEL_MAP = {
    "tasks": "Task",
    "deposit": "Deposit",
    "withdraw": "Withdrawal",
}


def _normalize_user_row(row) -> dict | None:
    if not row:
        return None

    data = dict(row)
    data["can_login"] = bool(data.get("can_login", 1))
    data["can_tasks"] = bool(data.get("can_tasks", 1))
    data["can_deposit"] = bool(data.get("can_deposit", 1))
    data["can_withdraw"] = bool(data.get("can_withdraw", 1))
    data["flagged"] = bool(data.get("flagged", 0))
    data["welcome_popup_hidden"] = bool(data.get("welcome_popup_hidden", 0))
    data["avatar_key"] = str(data.get("avatar_key") or "").strip()
    data["session_version"] = int(data.get("session_version") or 1)
    return data


def json_error(
    message: str,
    status_code: int = 400,
    *,
    session_invalidated: bool = False,
    blocked: bool = False,
    restriction: str | None = None,
):
    payload = {
        "success": False,
        "error": message,
        "message": message,
    }
    if session_invalidated:
        payload["session_invalidated"] = True
    if blocked:
        payload["blocked"] = True
    if restriction:
        payload["restriction"] = restriction
    return jsonify(payload), status_code


def login_user_session(user_row) -> None:
    session["user_id"] = user_row["user_id"]
    session["user_session_version"] = int(user_row.get("session_version") or 1)
    session.permanent = True


def clear_user_session() -> None:
    session.pop("user_id", None)
    session.pop("user_session_version", None)


def get_session_user_id() -> str | None:
    return session.get("user_id")


def get_current_user(required_permission: str | None = None):
    user_id = get_session_user_id()
    if not user_id:
        return None, json_error(
            "Please log in again.",
            401,
            session_invalidated=True,
        )

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                user_id,
                phone,
                email,
                balance,
                avatar_key,
                created_at,
                last_seen,
                welcome_popup_hidden,
                account_status,
                can_login,
                can_tasks,
                can_deposit,
                can_withdraw,
                flagged,
                session_version,
                restricted_reason,
                blocked_reason,
                review_reason
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    user = _normalize_user_row(row)
    if not user:
        clear_user_session()
        return None, json_error(
            "User session is no longer valid. Please log in again.",
            401,
            session_invalidated=True,
        )

    current_db_session_version = int(user["session_version"] or 1)
    current_cookie_session_version = int(session.get("user_session_version") or 0)
    if current_cookie_session_version != current_db_session_version:
        clear_user_session()
        return None, json_error(
            "Session expired. Please log in again.",
            401,
            session_invalidated=True,
        )

    if user["account_status"] == ACCOUNT_STATUS_BLOCKED or not user["can_login"]:
        clear_user_session()
        return None, json_error(
            "Your account has been disabled. Contact support.",
            403,
            session_invalidated=True,
            blocked=True,
            restriction="login",
        )

    if required_permission:
        field_name = PERMISSION_FIELD_MAP[required_permission]
        if not bool(user[field_name]):
            return None, json_error(
                f"{PERMISSION_LABEL_MAP[required_permission]} access is restricted on this account.",
                403,
                restriction=required_permission,
            )

    return user, None


def require_user_access(required_permission: str | None = None, data: dict | None = None):
    payload = data if isinstance(data, dict) else (request.get_json(silent=True) or {})
    user, error = get_current_user(required_permission=required_permission)
    if error:
        return None, payload, error
    return user, payload, None
