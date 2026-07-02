import sqlite3
from typing import Any

from services.activity_feed_service import record_activity_event
from services.db_service import fetch_all, fetch_one, has_column, now_iso
from services.message_service import (
    build_final_stage_unlocked_message,
    build_level_unlocked_message,
    create_message,
)
from services.task_assignment_service import (
    activate_base_tasks,
    ensure_user_level_tasks_assigned,
    get_visible_tasks_for_level,
    unlock_final_stage_tasks,
)
from utils.enums import ActivityEventType, UserLevelStatus

ACTIVE_LEVEL_STATUSES = {
    UserLevelStatus.ACTIVE_BASE.value,
    UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value,
    UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value,
}


def _is_free_level(level: dict[str, Any]) -> bool:
    return float(level["unlock_fee"] or 0) <= 0


def get_level_catalog(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return fetch_all(
        conn,
        """
        SELECT *
        FROM level_catalog
        WHERE is_active = 1
        ORDER BY level_number ASC
        """
    )


def get_level_by_id(conn: sqlite3.Connection, level_id: int) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        SELECT *
        FROM level_catalog
        WHERE id = ?
        """,
        (level_id,),
    )


def get_level_by_number(
    conn: sqlite3.Connection,
    level_number: int,
) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        SELECT *
        FROM level_catalog
        WHERE level_number = ?
        """,
        (level_number,),
    )


def get_user_level(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        SELECT *
        FROM user_levels
        WHERE user_id = ? AND level_id = ?
        """,
        (user_id, level_id),
    )


def get_user_levels(
    conn: sqlite3.Connection,
    user_id: str,
) -> list[dict[str, Any]]:
    return fetch_all(
        conn,
        """
        SELECT *
        FROM user_levels
        WHERE user_id = ?
        ORDER BY level_id ASC
        """,
        (user_id,),
    )


def get_or_create_user_level(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    user_level = get_user_level(conn, user_id, level_id)
    if user_level:
        return user_level

    timestamp = now_iso()
    conn.execute(
        """
        INSERT INTO user_levels (
            user_id,
            level_id,
            status,
            unlock_payment_status,
            is_started,
            is_completed,
            final_stage_unlocked,
            final_stage_payment_status,
            base_tasks_completed_count,
            total_tasks_completed_count,
            reward_credited,
            unlocked_at,
            started_at,
            final_stage_unlocked_at,
            completed_at,
            last_activity_at,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            level_id,
            UserLevelStatus.LOCKED.value,
            "pending",
            0,
            0,
            0,
            "pending",
            0,
            0,
            0,
            None,
            None,
            None,
            None,
            None,
            timestamp,
            timestamp,
        ),
    )
    conn.commit()

    created = get_user_level(conn, user_id, level_id)
    if not created:
        raise ValueError("Failed to create user level row.")
    return created


def get_active_incomplete_level(
    conn: sqlite3.Connection,
    user_id: str,
) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        SELECT ul.*, lc.level_number
        FROM user_levels ul
        JOIN level_catalog lc ON lc.id = ul.level_id
        WHERE ul.user_id = ?
          AND ul.status IN (?, ?, ?)
        ORDER BY ul.started_at ASC, ul.id ASC
        LIMIT 1
        """,
        (
            user_id,
            UserLevelStatus.ACTIVE_BASE.value,
            UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value,
            UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value,
        ),
    )


def _ensure_free_levels_available(
    conn: sqlite3.Connection,
    user_id: str,
) -> None:
    free_levels = fetch_all(
        conn,
        """
        SELECT *
        FROM level_catalog
        WHERE is_active = 1
          AND COALESCE(unlock_fee, 0) = 0
        ORDER BY level_number ASC
        """
    )

    if not free_levels:
        return

    timestamp = now_iso()

    for level in free_levels:
        user_level = get_user_level(conn, user_id, level["id"])

        if not user_level:
            user_level = get_or_create_user_level(conn, user_id, level["id"])

        if user_level["status"] == UserLevelStatus.COMPLETED.value:
            continue

        if user_level["status"] == UserLevelStatus.LOCKED.value:
            conn.execute(
                """
                UPDATE user_levels
                SET status = ?,
                    unlock_payment_status = ?,
                    unlocked_at = COALESCE(unlocked_at, ?),
                    updated_at = ?,
                    last_activity_at = ?
                WHERE user_id = ? AND level_id = ?
                """,
                (
                    UserLevelStatus.UNLOCKED_IDLE.value,
                    "success",
                    timestamp,
                    timestamp,
                    timestamp,
                    user_id,
                    level["id"],
                ),
            )
            conn.commit()

        user_level = get_user_level(conn, user_id, level["id"])
        if not user_level:
            raise ValueError("User level not found after free-level unlock.")

        ensure_user_level_tasks_assigned(conn, user_id, level["id"], user_level["id"])


def mark_level_unlocked(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    user_level = get_or_create_user_level(conn, user_id, level_id)
    timestamp = now_iso()

    if user_level["status"] == UserLevelStatus.COMPLETED.value:
        return user_level

    if _is_free_level(level):
        if user_level["status"] == UserLevelStatus.LOCKED.value:
            conn.execute(
                """
                UPDATE user_levels
                SET status = ?,
                    unlock_payment_status = ?,
                    unlocked_at = COALESCE(unlocked_at, ?),
                    updated_at = ?,
                    last_activity_at = ?
                WHERE user_id = ? AND level_id = ?
                """,
                (
                    UserLevelStatus.UNLOCKED_IDLE.value,
                    "success",
                    timestamp,
                    timestamp,
                    timestamp,
                    user_id,
                    level_id,
                ),
            )
            conn.commit()

        user_level = get_user_level(conn, user_id, level_id)
        if not user_level:
            raise ValueError("User level not found after unlock.")

        ensure_user_level_tasks_assigned(conn, user_id, level_id, user_level["id"])
        return get_user_level(conn, user_id, level_id)

    should_record = user_level["status"] == UserLevelStatus.LOCKED.value

    if user_level["status"] != UserLevelStatus.UNLOCKED_IDLE.value:
        conn.execute(
            """
            UPDATE user_levels
            SET status = ?,
                unlock_payment_status = ?,
                unlocked_at = COALESCE(unlocked_at, ?),
                updated_at = ?,
                last_activity_at = ?
            WHERE user_id = ? AND level_id = ?
            """,
            (
                UserLevelStatus.UNLOCKED_IDLE.value,
                "success",
                timestamp,
                timestamp,
                timestamp,
                user_id,
                level_id,
            ),
        )
        conn.commit()

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("User level not found after unlock.")

    ensure_user_level_tasks_assigned(conn, user_id, level_id, user_level["id"])

    if should_record:
        record_activity_event(
            conn,
            user_id=user_id,
            level_id=level_id,
            event_type=ActivityEventType.LEVEL_UNLOCKED.value,
        )

        create_message(
            conn,
            user_id,
            f"Level {level['level_number']} unlocked",
            f"Your payment for Level {level['level_number']} has been verified. The level is ready to start.",
            "level_unlocked",
        )

    return get_user_level(conn, user_id, level_id)


def start_level(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    level = get_level_by_id(conn, level_id)
    if not level:
        return {"success": False, "message": "Level not found."}

    active_level = get_active_incomplete_level(conn, user_id)
    if active_level and int(active_level["level_id"]) != int(level_id):
        return {
            "success": False,
            "message": "Complete your active level before entering another unlocked level.",
            "active_level_id": active_level["level_id"],
            "active_level_number": active_level["level_number"],
        }

    if _is_free_level(level):
        _ensure_free_levels_available(conn, user_id)

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        return {"success": False, "message": "This level is not unlocked yet."}

    if user_level["status"] == UserLevelStatus.COMPLETED.value:
        return {"success": False, "message": "This level is already completed."}

    if user_level["status"] == UserLevelStatus.LOCKED.value:
        return {"success": False, "message": "This level is not unlocked yet."}

    timestamp = now_iso()
    should_record = user_level["status"] == UserLevelStatus.UNLOCKED_IDLE.value

    if user_level["status"] == UserLevelStatus.UNLOCKED_IDLE.value:
        conn.execute(
            """
            UPDATE user_levels
            SET status = ?,
                is_started = 1,
                started_at = COALESCE(started_at, ?),
                updated_at = ?,
                last_activity_at = ?
            WHERE user_id = ? AND level_id = ?
            """,
            (
                UserLevelStatus.ACTIVE_BASE.value,
                timestamp,
                timestamp,
                timestamp,
                user_id,
                level_id,
            ),
        )

    if has_column(conn, "users", "current_active_level_id"):
        conn.execute(
            """
            UPDATE users
            SET current_active_level_id = ?
            WHERE user_id = ?
            """,
            (level_id, user_id),
        )

    conn.commit()

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("User level not found after start.")

    ensure_user_level_tasks_assigned(conn, user_id, level_id, user_level["id"])
    activate_base_tasks(conn, user_level["id"])

    if should_record:
        record_activity_event(
            conn,
            user_id=user_id,
            level_id=level_id,
            event_type=ActivityEventType.LEVEL_STARTED.value,
        )

    return {
        "success": True,
        "message": "Level started successfully.",
        "user_level": get_user_level(conn, user_id, level_id),
    }


def mark_final_stage_unlocked(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    if int(level["final_stage_enabled"]) != 1:
        raise ValueError("This level does not support final-stage unlock.")

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("User level not found.")

    if user_level["status"] != UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value:
        raise ValueError("Final stage cannot be unlocked in the current level state.")

    timestamp = now_iso()
    conn.execute(
        """
        UPDATE user_levels
        SET final_stage_unlocked = 1,
            final_stage_payment_status = ?,
            final_stage_unlocked_at = ?,
            status = ?,
            updated_at = ?,
            last_activity_at = ?
        WHERE user_id = ? AND level_id = ?
        """,
        (
            "success",
            timestamp,
            UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value,
            timestamp,
            timestamp,
            user_id,
            level_id,
        ),
    )
    conn.commit()

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("User level not found after final-stage unlock.")

    unlock_final_stage_tasks(conn, user_level["id"])

    record_activity_event(
        conn,
        user_id=user_id,
        level_id=level_id,
        event_type=ActivityEventType.FINAL_STAGE_UNLOCKED.value,
    )

    return get_user_level(conn, user_id, level_id)


def sync_user_level_progress(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("User level not found.")

    counts = fetch_one(
        conn,
        """
        SELECT
            SUM(CASE WHEN is_final_stage_task = 0 AND status = 'completed' THEN 1 ELSE 0 END) AS base_completed,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS total_completed
        FROM user_level_tasks
        WHERE user_level_id = ?
        """,
        (user_level["id"],),
    ) or {"base_completed": 0, "total_completed": 0}

    base_completed = int(counts["base_completed"] or 0)
    total_completed = int(counts["total_completed"] or 0)
    timestamp = now_iso()

    conn.execute(
        """
        UPDATE user_levels
        SET base_tasks_completed_count = ?,
            total_tasks_completed_count = ?,
            updated_at = ?,
            last_activity_at = ?
        WHERE user_id = ? AND level_id = ?
        """,
        (
            base_completed,
            total_completed,
            timestamp,
            timestamp,
            user_id,
            level_id,
        ),
    )
    conn.commit()

    return get_user_level(conn, user_id, level_id)


def _build_card_state(
    level: dict[str, Any],
    user_level: dict[str, Any] | None,
    active_level: dict[str, Any] | None,
) -> tuple[str, bool, str]:
    is_free = _is_free_level(level)

    if not user_level or user_level["status"] == UserLevelStatus.LOCKED.value:
        if is_free:
            if active_level and active_level["level_id"] != level["id"]:
                return (
                    "free_locked_blocked",
                    False,
                    "Finish Active Level First",
                )
            return "free_available", True, "Start Free Task"

        return "locked", False, "Unlock Level"

    if user_level["status"] == UserLevelStatus.COMPLETED.value:
        return "completed", True, "View Summary"

    if user_level["status"] == UserLevelStatus.UNLOCKED_IDLE.value:
        if active_level and active_level["level_id"] != level["id"]:
            return (
                "unlocked_blocked_by_active_level",
                False,
                "Finish Active Level First",
            )
        return (
            "free_idle" if is_free else "unlocked_idle",
            True,
            "Start Free Task" if is_free else "Start Level",
        )

    if user_level["status"] == UserLevelStatus.ACTIVE_BASE.value:
        return "active_base", True, "Continue"

    if user_level["status"] == UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value:
        return "active_final_stage_pending", True, "Continue Progress"

    if user_level["status"] == UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value:
        return "active_final_stage_open", True, "Continue"

    return "locked", False, "Unlock Level"


def build_level_board(
    conn: sqlite3.Connection,
    user_id: str,
) -> dict[str, Any]:
    _ensure_free_levels_available(conn, user_id)

    levels = get_level_catalog(conn)
    user_levels = {
        row["level_id"]: row
        for row in get_user_levels(conn, user_id)
    }
    active_level = get_active_incomplete_level(conn, user_id)

    completed_count = sum(
        1 for row in user_levels.values()
        if row["status"] == UserLevelStatus.COMPLETED.value
    )
    total_levels = len(levels)
    free_levels = [level for level in levels if _is_free_level(level)]
    paid_levels = [level for level in levels if not _is_free_level(level)]
    free_levels_reward_total = sum(float(level["completion_reward"] or 0) for level in free_levels)
    progress_percent = round((completed_count / total_levels) * 100, 2) if total_levels else 0.0

    board_levels = []

    for level in levels:
        user_level = user_levels.get(level["id"])
        card_state, is_accessible_now, action_label = _build_card_state(
            level,
            user_level,
            active_level,
        )

        raw_completed = int(user_level["total_tasks_completed_count"]) if user_level else 0
        display_total = int(level["base_task_count"] or 0)

        if int(level["final_stage_enabled"] or 0) == 1:
            if user_level and user_level["status"] in (
                UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value,
                UserLevelStatus.COMPLETED.value,
            ):
                display_total = int(level["total_task_count"] or 0)
            else:
                display_total = int(level["base_task_count"] or 0)
        else:
            display_total = int(level["total_task_count"] or level["base_task_count"] or 0)

        progress_completed = min(raw_completed, display_total)

        board_levels.append(
            {
                "level_id": level["id"],
                "level_number": level["level_number"],
                "unlock_fee": float(level["unlock_fee"]),
                "final_stage_fee": float(level["final_stage_fee"]),
                "completion_reward": float(level["completion_reward"]),
                "state": card_state,
                "is_accessible_now": is_accessible_now,
                "is_unlocked": bool(user_level and user_level["status"] != UserLevelStatus.LOCKED.value),
                "is_completed": bool(user_level and user_level["status"] == UserLevelStatus.COMPLETED.value),
                "is_active": bool(active_level and active_level["level_id"] == level["id"]),
                "progress_completed": progress_completed,
                "progress_total": display_total,
                "action_label": action_label,
                "is_free_task": _is_free_level(level),
            }
        )

    return {
        "levels": board_levels,
        "completed_levels_count": completed_count,
        "total_levels": total_levels,
        "progress_percent": progress_percent,
        "free_levels_count": len(free_levels),
        "paid_levels_count": len(paid_levels),
        "free_levels_reward_total": float(free_levels_reward_total),
        "active_level_id": active_level["level_id"] if active_level else None,
        "active_level_number": active_level["level_number"] if active_level else None,
        "active_level_status": active_level["status"] if active_level else None,
    }


def build_level_detail(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    _ensure_free_levels_available(conn, user_id)

    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    user_level = get_user_level(conn, user_id, level_id)
    active_level = get_active_incomplete_level(conn, user_id)

    is_accessible_now = True
    if (
        active_level
        and active_level["level_id"] != level_id
        and user_level
        and user_level["status"] == UserLevelStatus.UNLOCKED_IDLE.value
    ):
        is_accessible_now = False

    if not user_level:
        return {
            "level_id": level["id"],
            "level_number": level["level_number"],
            "state": "locked",
            "unlock_fee": float(level["unlock_fee"]),
            "final_stage_fee": float(level["final_stage_fee"]),
            "completion_reward": float(level["completion_reward"]),
            "is_accessible_now": False,
            "show_final_stage_gate": False,
            "is_free_task": _is_free_level(level),
            "tasks": [],
        }

    include_final_stage_tasks = user_level["status"] in (
        UserLevelStatus.ACTIVE_FINAL_STAGE_OPEN.value,
        UserLevelStatus.COMPLETED.value,
    )

    tasks = get_visible_tasks_for_level(
        conn,
        user_level_id=user_level["id"],
        include_final_stage_tasks=include_final_stage_tasks,
    )

    visible_total = (
        int(level["total_task_count"])
        if include_final_stage_tasks
        else int(level["base_task_count"])
    )

    visible_completed = min(
        int(user_level["total_tasks_completed_count"]) if include_final_stage_tasks else int(user_level["base_tasks_completed_count"]),
        visible_total,
    )

    return {
        "level_id": level["id"],
        "level_number": level["level_number"],
        "state": user_level["status"],
        "unlock_fee": float(level["unlock_fee"]),
        "final_stage_fee": float(level["final_stage_fee"]),
        "completion_reward": float(level["completion_reward"]),
        "is_accessible_now": is_accessible_now,
        "show_final_stage_gate": user_level["status"] == UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value,
        "final_stage_unlocked": bool(user_level["final_stage_unlocked"]),
        "progress_completed": visible_completed,
        "progress_total": visible_total,
        "is_free_task": _is_free_level(level),
        "tasks": tasks,
    }