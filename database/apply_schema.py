import sqlite3
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import AVATAR_FILENAMES, DATABASE_PATH  # noqa: E402

SCHEMA_PATH = ROOT_DIR / "database" / "schema.sql"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def ensure_column(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition_sql: str,
) -> None:
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition_sql}")


def apply_schema() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as conn:
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        conn.executescript(schema_sql)

        # Existing projects might already have users without these columns.
        ensure_column(conn, "users", "balance", "REAL DEFAULT 0")
        ensure_column(conn, "users", "email", "TEXT")
        ensure_column(conn, "users", "current_active_level_id", "INTEGER")
        ensure_column(conn, "users", "welcome_popup_hidden", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "users", "avatar_key", "TEXT")

        manual_payment_columns = {
            "approval_source": "TEXT",
            "admin_action_metadata": "TEXT",
            "telegram_message_id": "TEXT",
            "telegram_notified_at": "TEXT",
            "telegram_notification_status": "TEXT",
            "telegram_notification_error": "TEXT",
            "telegram_approved_notified_at": "TEXT",
            "telegram_cancel_notified_at": "TEXT",
            "telegram_last_update_at": "TEXT",
        }
        for column, definition in manual_payment_columns.items():
            ensure_column(conn, "manual_payments", column, definition)

        avatar_rows = conn.execute(
            "SELECT user_id FROM users WHERE avatar_key IS NULL OR TRIM(COALESCE(avatar_key, '')) = ''"
        ).fetchall()
        if avatar_rows:
            import random

            for row in avatar_rows:
                conn.execute(
                    "UPDATE users SET avatar_key=? WHERE user_id=?",
                    (random.choice(AVATAR_FILENAMES), row["user_id"]),
                )

        conn.commit()

    print(f"Schema applied successfully to: {DATABASE_PATH}")


if __name__ == "__main__":
    apply_schema()
