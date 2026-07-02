import json

from flask import Blueprint, jsonify, request

from services.db_service import fetch_all, fetch_one, get_connection, now_iso
from services.level_service import (
    build_level_board,
    build_level_detail,
    get_active_incomplete_level,
    get_level_catalog,
    get_level_by_id,
    start_level,
)
from services.task_submission_service import (
    open_task_for_user,
    submit_task_answer,
)
from utils.auth import json_error as auth_json_error, require_user_access

task_bp = Blueprint("task_bp", __name__)



def _json_error(
    message: str,
    status_code: int = 400,
    *,
    session_invalidated: bool = False,
    blocked: bool = False,
    restriction: str | None = None,
):
    return auth_json_error(
        message,
        status_code,
        session_invalidated=session_invalidated,
        blocked=blocked,
        restriction=restriction,
    )



@task_bp.get("/api/levels/catalog")
def levels_catalog():
    with get_connection() as conn:
        levels = get_level_catalog(conn)

    cleaned = [
        {
            "level_id": level["id"],
            "level_number": level["level_number"],
            "unlock_fee": float(level["unlock_fee"]),
            "final_stage_fee": float(level["final_stage_fee"]),
            "completion_reward": float(level["completion_reward"]),
            "base_task_count": int(level["base_task_count"]),
            "total_task_count": int(level["total_task_count"]),
            "final_stage_enabled": bool(level["final_stage_enabled"]),
        }
        for level in levels
    ]

    return jsonify({"success": True, "levels": cleaned})


@task_bp.post("/api/levels/board")
def levels_board():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    with get_connection() as conn:
        board = build_level_board(conn, user["user_id"])

    return jsonify({"success": True, "board": board})


@task_bp.post("/api/levels/detail")
def level_detail():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    try:
        with get_connection() as conn:
            detail = build_level_detail(conn, user["user_id"], level_id)
        return jsonify({"success": True, "detail": detail})
    except ValueError as exc:
        return _json_error(str(exc), 404)


@task_bp.post("/api/levels/start")
def level_start():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    with get_connection() as conn:
        result = start_level(conn, user["user_id"], level_id)

    if not result.get("success"):
        return _json_error(result.get("message", "Unable to start level."), 403)

    return jsonify(result)


@task_bp.post("/api/levels/active")
def active_level():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    with get_connection() as conn:
        active = get_active_incomplete_level(conn, user["user_id"])

    return jsonify({"success": True, "active_level": active})


@task_bp.post("/api/tasks/list")
def task_list():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    try:
        with get_connection() as conn:
            detail = build_level_detail(conn, user["user_id"], level_id)

        tasks = []
        for task in detail.get("tasks", []):
            payload = json.loads(task["task_payload"] or "{}")
            tasks.append(
                {
                    "task_id": task["id"],
                    "task_slot": task["task_slot"],
                    "status": task["status"],
                    "is_final_stage_task": bool(task["is_final_stage_task"]),
                    "category_key": payload.get("category_key"),
                    "display_name": payload.get("display_name"),
                    "source_type": payload.get("source_type"),
                }
            )

        return jsonify(
            {
                "success": True,
                "level_id": level_id,
                "show_final_stage_gate": detail.get("show_final_stage_gate", False),
                "tasks": tasks,
            }
        )
    except ValueError as exc:
        return _json_error(str(exc), 404)


@task_bp.post("/api/tasks/open")
def task_open():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    task_id = data.get("task_id")

    if not level_id or not task_id:
        return _json_error("Missing level_id or task_id.")

    try:
        level_id = int(level_id)
        task_id = int(task_id)
    except Exception:
        return _json_error("Invalid level_id or task_id.")

    try:
        with get_connection() as conn:
            task_data = open_task_for_user(conn, user["user_id"], level_id, task_id)
        return jsonify({"success": True, "task": task_data})
    except PermissionError as exc:
        return _json_error(str(exc), 403)
    except ValueError as exc:
        return _json_error(str(exc), 400)


@task_bp.post("/api/tasks/submit")
def task_submit():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    task_id = data.get("task_id")
    verification_token = data.get("verification_token")
    submitted_answer = data.get("submitted_answer")

    if not level_id or not task_id or not verification_token:
        return _json_error(
            "Missing level_id, task_id, or verification_token."
        )

    try:
        level_id = int(level_id)
        task_id = int(task_id)
    except Exception:
        return _json_error("Invalid level_id or task_id.")

    try:
        with get_connection() as conn:
            result = submit_task_answer(
                conn=conn,
                user_id=user["user_id"],
                level_id=level_id,
                task_id=task_id,
                verification_token=verification_token,
                submitted_answer=submitted_answer,
                ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            )
        return jsonify(result)
    except PermissionError as exc:
        return _json_error(str(exc), 403)
    except ValueError as exc:
        return _json_error(str(exc), 400)


@task_bp.post("/api/tasks/progress")
def task_progress():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    level_id = data.get("level_id")
    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    try:
        with get_connection() as conn:
            detail = build_level_detail(conn, user["user_id"], level_id)
            level = get_level_by_id(conn, level_id)

        if not level:
            return _json_error("Level not found.", 404)

        return jsonify(
            {
                "success": True,
                "progress": {
                    "level_id": level_id,
                    "level_number": level["level_number"],
                    "state": detail["state"],
                    "progress_completed": detail["progress_completed"],
                    "progress_total": detail["progress_total"],
                    "show_final_stage_gate": detail["show_final_stage_gate"],
                    "final_stage_unlocked": detail["final_stage_unlocked"],
                },
            }
        )
    except ValueError as exc:
        return _json_error(str(exc), 404)


def _normalize_answer(value: str | None) -> str:
    return str(value or "").strip().lower()


def _safe_bonus_payload(payload_json: str | None) -> dict:
    try:
        payload = json.loads(payload_json or "{}")
    except Exception:
        payload = {}

    content = payload.get("content") if isinstance(payload, dict) else {}
    if isinstance(content, dict):
        public_content = dict(content)
        public_content.pop("answer", None)
        payload["content"] = public_content

    return payload if isinstance(payload, dict) else {}


def _load_bonus_payload(payload_json: str | None) -> dict:
    try:
        payload = json.loads(payload_json or "{}")
    except Exception:
        payload = {}
    return payload if isinstance(payload, dict) else {}




def _format_bonus_task_row(row: dict) -> dict:
    payload = _safe_bonus_payload(row.get("task_payload_json"))
    completed = str(row.get("status") or "").lower() == "completed"
    return {
        "bonus_task_id": row["id"],
        "task_key": row["task_key"],
        "title": row["title"],
        "category_key": row["category_key"],
        "description": row["description"],
        "reward": float(row["reward"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "status": "completed" if completed else "available",
        "is_completed": completed,
        "completed_at": row.get("completed_at"),
        "task_payload": payload,
    }


@task_bp.post("/api/bonus-tasks/list")
def bonus_tasks_list():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    with get_connection() as conn:
        rows = fetch_all(
            conn,
            """
            SELECT
                btc.id,
                btc.task_key,
                btc.title,
                btc.category_key,
                btc.description,
                btc.task_payload_json,
                btc.reward,
                btc.sort_order,
                COALESCE(ubt.status, 'available') AS status,
                ubt.completed_at
            FROM bonus_task_catalog btc
            LEFT JOIN user_bonus_tasks ubt
              ON ubt.bonus_task_id = btc.id
             AND ubt.user_id = ?
            WHERE btc.is_active = 1
            ORDER BY btc.sort_order ASC, btc.id ASC
            """,
            (user["user_id"],),
        )

    bonus_tasks = [_format_bonus_task_row(row) for row in rows]
    return jsonify({"success": True, "bonus_tasks": bonus_tasks})


@task_bp.post("/api/bonus-tasks/submit")
def bonus_task_submit():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("tasks", data)
    if error:
        return error

    bonus_task_id = data.get("bonus_task_id")
    submitted_answer = data.get("submitted_answer")

    if not bonus_task_id:
        return _json_error("Missing bonus_task_id.")

    try:
        bonus_task_id = int(bonus_task_id)
    except Exception:
        return _json_error("Invalid bonus_task_id.")

    try:
        with get_connection() as conn:
            task_row = fetch_one(
                conn,
                """
                SELECT *
                FROM bonus_task_catalog
                WHERE id = ? AND is_active = 1
                """,
                (bonus_task_id,),
            )

            if not task_row:
                return _json_error("Bonus task not found.", 404)

            existing = fetch_one(
                conn,
                """
                SELECT *
                FROM user_bonus_tasks
                WHERE user_id = ? AND bonus_task_id = ?
                """,
                (user["user_id"], bonus_task_id),
            )

            if existing and str(existing.get("status") or "").lower() == "completed":
                return _json_error("This bonus task has already been completed.", 409)

            payload = _load_bonus_payload(task_row["task_payload_json"])
            expected_answer = _normalize_answer(payload.get("content", {}).get("answer"))
            user_answer = _normalize_answer(submitted_answer)

            if user_answer != expected_answer:
                return jsonify({
                    "success": True,
                    "result": "incorrect",
                    "message": "Incorrect answer. Please try again.",
                    "bonus_task_id": bonus_task_id,
                })

            reward = float(task_row["reward"] or 0)
            conn.execute(
                "UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE user_id = ?",
                (reward, user["user_id"]),
            )
            conn.execute(
                """
                INSERT INTO user_bonus_tasks (
                    user_id,
                    bonus_task_id,
                    status,
                    completed_at,
                    reward_credited,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, 'completed', ?, 1, ?, ?)
                ON CONFLICT(user_id, bonus_task_id) DO UPDATE SET
                    status = 'completed',
                    completed_at = excluded.completed_at,
                    reward_credited = 1,
                    updated_at = excluded.updated_at
                """,
                (user["user_id"], bonus_task_id, now_iso(), now_iso(), now_iso()),
            )
            conn.commit()

            balance_row = fetch_one(
                conn,
                "SELECT balance FROM users WHERE user_id = ?",
                (user["user_id"],),
            ) or {"balance": 0}

        return jsonify({
            "success": True,
            "result": "correct",
            "message": "Bonus task completed successfully.",
            "bonus_task_id": bonus_task_id,
            "reward": reward,
            "balance": float(balance_row.get("balance") or 0),
        })
    except ValueError as exc:
        return _json_error(str(exc), 400)
