import json
import sqlite3
from typing import Any

from services.activity_feed_service import record_activity_event
from services.db_service import fetch_one, has_column, now_iso
from services.level_service import (
    get_active_incomplete_level,
    get_level_by_id,
    get_user_level,
    sync_user_level_progress,
)
from services.reward_service import credit_level_completion_reward
from services.message_service import (
    build_level_completed_message,
    create_message,
)
from utils.enums import ActivityEventType, SubmissionResult, TaskStatus, UserLevelStatus


def _normalize_answer(value: Any) -> str:
    return str(value or "").strip().lower()


def _get_task_row(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
    task_id: int,
) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        SELECT
            ult.*,
            ul.status AS user_level_status,
            ul.final_stage_unlocked,
            lc.level_number,
            lc.base_task_count,
            lc.total_task_count
        FROM user_level_tasks ult
        JOIN user_levels ul ON ul.id = ult.user_level_id
        JOIN level_catalog lc ON lc.id = ult.level_id
        WHERE ult.id = ?
          AND ult.user_id = ?
          AND ult.level_id = ?
        """,
        (task_id, user_id, level_id),
    )


def _mark_level_completed(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    timestamp = now_iso()

    conn.execute(
        """
        UPDATE user_levels
        SET
            status = ?,
            is_completed = 1,
            completed_at = ?,
            updated_at = ?,
            last_activity_at = ?
        WHERE user_id = ? AND level_id = ?
        """,
        (
            UserLevelStatus.COMPLETED.value,
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
            SET current_active_level_id = NULL
            WHERE user_id = ? AND current_active_level_id = ?
            """,
            (user_id, level_id),
        )

    conn.commit()
    reward_result = credit_level_completion_reward(conn, user_id, level_id)

    level_row = get_level_by_id(conn, level_id)
    level_number = level_row["level_number"] if level_row else level_id
    title, body = build_level_completed_message(level_number, reward_result.get("amount", 0))

    create_message(
        conn,
        user_id,
        title,
        body,
        "level_completed",
    )

    record_activity_event(
        conn,
        user_id=user_id,
        level_id=level_id,
        event_type=ActivityEventType.LEVEL_COMPLETED.value,
    )

    return {
        "level_completed": True,
        "reward_result": reward_result,
    }


def _record_submission(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
    user_level_task_id: int,
    verification_token: str,
    submitted_answer: str,
    result: str,
    ip_address: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO task_submissions (
            user_id,
            level_id,
            user_level_task_id,
            verification_token,
            submitted_answer,
            result,
            ip_address,
            submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            level_id,
            user_level_task_id,
            verification_token,
            submitted_answer,
            result,
            ip_address,
            now_iso(),
        ),
    )


def open_task_for_user(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
    task_id: int,
) -> dict[str, Any]:
    active_level = get_active_incomplete_level(conn, user_id)
    if active_level and int(active_level["level_id"]) != int(level_id):
        raise PermissionError(
            "Complete your active level before accessing another unlocked level."
        )

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("This level is not available for this user.")

    if user_level["status"] in (
        UserLevelStatus.LOCKED.value,
        UserLevelStatus.UNLOCKED_IDLE.value,
    ):
        raise ValueError("Start this level first before opening tasks.")

    task_row = _get_task_row(conn, user_id, level_id, task_id)
    if not task_row:
        raise ValueError("Task not found.")

    if task_row["status"] == TaskStatus.COMPLETED.value:
        raise ValueError("This task has already been completed.")

    if task_row["status"] not in (
        TaskStatus.AVAILABLE.value,
        TaskStatus.STARTED.value,
    ):
        raise ValueError("This task is not currently available.")

    if task_row["status"] == TaskStatus.AVAILABLE.value:
        conn.execute(
            """
            UPDATE user_level_tasks
            SET
                status = ?,
                started_at = COALESCE(started_at, ?),
                updated_at = ?
            WHERE id = ?
            """,
            (
                TaskStatus.STARTED.value,
                now_iso(),
                now_iso(),
                task_id,
            ),
        )
        conn.commit()

    payload = json.loads(task_row["task_payload"] or "{}")

    return {
        "task_id": task_row["id"],
        "level_id": task_row["level_id"],
        "level_number": task_row["level_number"],
        "category_key": payload.get("category_key"),
        "display_name": payload.get("display_name"),
        "source_type": payload.get("source_type"),
        "task_payload": payload,
        "verification_token": task_row["verification_token"],
        "status": TaskStatus.STARTED.value,
    }


def submit_task_answer(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
    task_id: int,
    verification_token: str,
    submitted_answer: Any,
    ip_address: str | None = None,
) -> dict[str, Any]:
    active_level = get_active_incomplete_level(conn, user_id)
    if active_level and int(active_level["level_id"]) != int(level_id):
        raise PermissionError(
            "Complete your active level before submitting tasks from another level."
        )

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("This level is not available for this user.")

    task_row = _get_task_row(conn, user_id, level_id, task_id)
    if not task_row:
        raise ValueError("Task not found.")

    if task_row["verification_token"] != verification_token:
        raise ValueError("Invalid task verification token.")

    if task_row["status"] == TaskStatus.COMPLETED.value:
        raise ValueError("This task has already been completed.")

    if task_row["status"] not in (
        TaskStatus.AVAILABLE.value,
        TaskStatus.STARTED.value,
    ):
        raise ValueError("This task is not currently open for submission.")

    expected_answer_ref = json.loads(task_row["expected_answer_ref"] or "{}")
    correct_answer = _normalize_answer(expected_answer_ref.get("correct_answer"))
    user_answer = _normalize_answer(submitted_answer)

    is_correct = user_answer == correct_answer
    result_value = (
        SubmissionResult.CORRECT.value
        if is_correct
        else SubmissionResult.INCORRECT.value
    )

    _record_submission(
        conn=conn,
        user_id=user_id,
        level_id=level_id,
        user_level_task_id=task_id,
        verification_token=verification_token,
        submitted_answer=str(submitted_answer or ""),
        result=result_value,
        ip_address=ip_address,
    )

    if not is_correct:
        conn.execute(
            """
            UPDATE user_level_tasks
            SET
                status = ?,
                submission_count = submission_count + 1,
                updated_at = ?
            WHERE id = ?
            """,
            (
                TaskStatus.STARTED.value,
                now_iso(),
                task_id,
            ),
        )
        conn.commit()

        user_level = sync_user_level_progress(conn, user_id, level_id)
        return {
            "success": True,
            "result": SubmissionResult.INCORRECT.value,
            "message": "Incorrect answer. Try again.",
            "level_state": user_level["status"],
            "base_tasks_completed_count": int(user_level["base_tasks_completed_count"]),
            "total_tasks_completed_count": int(user_level["total_tasks_completed_count"]),
            "level_completed": False,
            "reward_result": None,
        }

    conn.execute(
        """
        UPDATE user_level_tasks
        SET
            status = ?,
            submission_count = submission_count + 1,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            TaskStatus.COMPLETED.value,
            now_iso(),
            now_iso(),
            task_id,
        ),
    )
    conn.commit()

    payload = json.loads(task_row["task_payload"] or "{}")
    record_activity_event(
        conn,
        user_id=user_id,
        level_id=level_id,
        event_type=ActivityEventType.TASK_COMPLETED.value,
        task_category_key=payload.get("category_key"),
    )

    user_level = sync_user_level_progress(conn, user_id, level_id)
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found after task completion sync.")

    level_completed = False
    reward_result = None
    timestamp = now_iso()

    base_done = int(user_level["base_tasks_completed_count"] or 0)
    total_done = int(user_level["total_tasks_completed_count"] or 0)
    base_required = int(level["base_task_count"] or 0)
    total_required = int(level["total_task_count"] or 0)
    final_stage_enabled = int(level["final_stage_enabled"] or 0)
    final_stage_unlocked = int(user_level["final_stage_unlocked"] or 0)

    if final_stage_enabled == 0:
        if total_done >= total_required:
            completion = _mark_level_completed(conn, user_id, level_id)
            level_completed = completion["level_completed"]
            reward_result = completion["reward_result"]

    else:
        if final_stage_unlocked == 0 and base_done >= base_required:
            conn.execute(
                """
                UPDATE user_levels
                SET
                    status = ?,
                    updated_at = ?,
                    last_activity_at = ?
                WHERE user_id = ? AND level_id = ?
                """,
                (
                    UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value,
                    timestamp,
                    timestamp,
                    user_id,
                    level_id,
                ),
            )
            conn.commit()

        elif final_stage_unlocked == 1 and total_done >= total_required:
            completion = _mark_level_completed(conn, user_id, level_id)
            level_completed = completion["level_completed"]
            reward_result = completion["reward_result"]

    latest_user_level = get_user_level(conn, user_id, level_id)
    if not latest_user_level:
        raise ValueError("User level not found after submission processing.")

    return {
        "success": True,
        "result": SubmissionResult.CORRECT.value,
        "message": "Task completed successfully.",
        "level_state": latest_user_level["status"],
        "base_tasks_completed_count": int(latest_user_level["base_tasks_completed_count"]),
        "total_tasks_completed_count": int(latest_user_level["total_tasks_completed_count"]),
        "level_completed": level_completed,
        "reward_result": reward_result,
    }