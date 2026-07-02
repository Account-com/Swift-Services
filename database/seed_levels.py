import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import DATABASE_PATH, LEVEL_CATALOG  # noqa: E402


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _placeholders(values: Iterable[object]) -> str:
    values = list(values)
    return ",".join("?" for _ in values)


def purge_removed_levels(conn: sqlite3.Connection) -> None:
    desired_level_numbers = [int(level["level_number"]) for level in LEVEL_CATALOG]
    if not desired_level_numbers:
        return

    placeholder = _placeholders(desired_level_numbers)
    removed_rows = conn.execute(
        f"""
        SELECT id, level_number
        FROM level_catalog
        WHERE level_number NOT IN ({placeholder})
        """,
        desired_level_numbers,
    ).fetchall()

    removed_level_ids = [int(row["id"]) for row in removed_rows]
    if not removed_level_ids:
        return

    id_placeholders = _placeholders(removed_level_ids)

    # Remove child data first so foreign key constraints do not get in the way.
    conn.execute(
        f"DELETE FROM task_submissions WHERE level_id IN ({id_placeholders})",
        removed_level_ids,
    )
    conn.execute(
        f"DELETE FROM user_level_tasks WHERE level_id IN ({id_placeholders})",
        removed_level_ids,
    )
    conn.execute(
        f"DELETE FROM payment_intents WHERE level_id IN ({id_placeholders})",
        removed_level_ids,
    )
    conn.execute(
        f"DELETE FROM activity_feed_events WHERE level_id IN ({id_placeholders})",
        removed_level_ids,
    )
    conn.execute(
        f"DELETE FROM user_levels WHERE level_id IN ({id_placeholders})",
        removed_level_ids,
    )
    conn.execute(
        f"DELETE FROM level_catalog WHERE id IN ({id_placeholders})",
        removed_level_ids,
    )


def seed_levels() -> None:
    timestamp = now_iso()

    with get_connection() as conn:
        purge_removed_levels(conn)

        for level in LEVEL_CATALOG:
            existing = conn.execute(
                "SELECT id FROM level_catalog WHERE level_number = ?",
                (level["level_number"],),
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE level_catalog
                    SET
                        unlock_fee = ?,
                        final_stage_fee = ?,
                        completion_reward = ?,
                        base_task_count = ?,
                        total_task_count = ?,
                        final_stage_enabled = ?,
                        is_active = 1
                    WHERE level_number = ?
                    """,
                    (
                        level["unlock_fee"],
                        level["final_stage_fee"],
                        level["completion_reward"],
                        level["base_task_count"],
                        level["total_task_count"],
                        level["final_stage_enabled"],
                        level["level_number"],
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO level_catalog (
                        level_number,
                        unlock_fee,
                        final_stage_fee,
                        completion_reward,
                        base_task_count,
                        total_task_count,
                        final_stage_enabled,
                        is_active,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        level["level_number"],
                        level["unlock_fee"],
                        level["final_stage_fee"],
                        level["completion_reward"],
                        level["base_task_count"],
                        level["total_task_count"],
                        level["final_stage_enabled"],
                        1,
                        timestamp,
                    ),
                )

        conn.commit()

    print("Levels seeded successfully.")


if __name__ == "__main__":
    seed_levels()