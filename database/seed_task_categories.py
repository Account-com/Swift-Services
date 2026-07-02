import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import DATABASE_PATH, TASK_CATEGORIES  # noqa: E402


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def seed_task_categories() -> None:
    timestamp = now_iso()

    with get_connection() as conn:
        for category in TASK_CATEGORIES:
            existing = conn.execute(
                "SELECT id FROM task_category_catalog WHERE category_key = ?",
                (category["category_key"],),
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE task_category_catalog
                    SET
                        display_name = ?,
                        source_type = ?,
                        is_active = 1
                    WHERE category_key = ?
                    """,
                    (
                        category["display_name"],
                        category["source_type"],
                        category["category_key"],
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO task_category_catalog (
                        category_key,
                        display_name,
                        source_type,
                        is_active,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        category["category_key"],
                        category["display_name"],
                        category["source_type"],
                        1,
                        timestamp,
                    ),
                )

        conn.commit()

    print("Task categories seeded successfully.")


if __name__ == "__main__":
    seed_task_categories()