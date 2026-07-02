import sqlite3
from typing import Any

from services.db_service import fetch_all, fetch_one, now_iso
from utils.enums import ActivityEventType


def mask_user_id(user_id: str) -> str:
    value = str(user_id or "").strip()
    if len(value) <= 4:
        return f"{value}****"
    return f"{value[:4]}****"


def record_activity_event(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    level_id: int | None,
    event_type: str,
    task_category_key: str | None = None,
    custom_text: str | None = None,
) -> None:
    if custom_text:
        text = custom_text
    else:
        level_number = None
        if level_id:
            row = fetch_one(
                conn,
                "SELECT level_number FROM level_catalog WHERE id = ?",
                (level_id,),
            )
            if row:
                level_number = row["level_number"]

        masked_user = mask_user_id(user_id)

        if event_type == ActivityEventType.LEVEL_UNLOCKED.value:
            text = f"{masked_user} unlocked Level {level_number}"
        elif event_type == ActivityEventType.LEVEL_STARTED.value:
            text = f"{masked_user} started Level {level_number}"
        elif event_type == ActivityEventType.TASK_COMPLETED.value:
            pretty_task = str(task_category_key or "").replace("_", " ").title()
            text = f"{masked_user} finished {pretty_task}"
        elif event_type == ActivityEventType.FINAL_STAGE_UNLOCKED.value:
            text = f"{masked_user} continued Level {level_number}"
        elif event_type == ActivityEventType.LEVEL_COMPLETED.value:
            text = f"{masked_user} completed Level {level_number}"
        elif event_type == ActivityEventType.WITHDRAWAL_REQUESTED.value:
            text = f"{masked_user} requested a withdrawal"
        elif event_type == ActivityEventType.WITHDRAWAL_APPROVED.value:
            text = f"{masked_user} withdrawal approved"
        elif event_type == ActivityEventType.WITHDRAWAL_REJECTED.value:
            text = f"{masked_user} withdrawal rejected"
        else:
            text = f"{masked_user} activity updated"

    conn.execute(
        """
        INSERT INTO activity_feed_events (
            user_id,
            level_id,
            event_type,
            task_category_key,
            masked_display_text,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            level_id,
            event_type,
            task_category_key,
            text,
            now_iso(),
        ),
    )
    conn.commit()


def get_activity_feed(
    conn: sqlite3.Connection,
    limit: int = 20,
) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        SELECT *
        FROM activity_feed_events
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (int(limit),),
    )
    return rows


def get_user_achievement_summary(
    conn: sqlite3.Connection,
    user_id: str,
) -> list[dict[str, Any]]:
    completed_count_row = fetch_one(
        conn,
        """
        SELECT COUNT(*) AS total
        FROM user_levels
        WHERE user_id = ?
          AND is_completed = 1
        """,
        (user_id,),
    ) or {"total": 0}

    unlocked_count_row = fetch_one(
        conn,
        """
        SELECT COUNT(*) AS total
        FROM user_levels
        WHERE user_id = ?
          AND status != 'locked'
        """,
        (user_id,),
    ) or {"total": 0}

    final_stage_count_row = fetch_one(
        conn,
        """
        SELECT COUNT(*) AS total
        FROM user_levels
        WHERE user_id = ?
          AND final_stage_unlocked = 1
        """,
        (user_id,),
    ) or {"total": 0}

    completed_count = int(completed_count_row["total"] or 0)
    unlocked_count = int(unlocked_count_row["total"] or 0)
    final_stage_count = int(final_stage_count_row["total"] or 0)

    badges: list[dict[str, Any]] = []

    if unlocked_count >= 1:
        badges.append(
            {
                "key": "first_unlock",
                "label": "First Unlock",
                "description": "Unlocked your first level",
            }
        )

    if completed_count >= 1:
        badges.append(
            {
                "key": "first_completion",
                "label": "First Completion",
                "description": "Completed your first level",
            }
        )

    if completed_count >= 3:
        badges.append(
            {
                "key": "level_3_finisher",
                "label": "Level 3 Finisher",
                "description": "Completed three levels",
            }
        )

    if final_stage_count >= 1:
        badges.append(
            {
                "key": "final_stage_runner",
                "label": "Final Stage Runner",
                "description": "Unlocked a final stage",
            }
        )

    if completed_count >= 10:
        badges.append(
            {
                "key": "ten_level_club",
                "label": "Ten Level Club",
                "description": "Completed ten levels",
            }
        )

    return badges