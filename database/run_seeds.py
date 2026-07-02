import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import ADMIN_PASSWORD, ADMIN_USERNAME, DATABASE_PATH  # noqa: E402
from database.apply_schema import apply_schema  # noqa: E402
from database.seed_bonus_tasks import seed_bonus_tasks  # noqa: E402
from database.seed_levels import seed_levels  # noqa: E402
from database.seed_task_categories import seed_task_categories  # noqa: E402


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed_admin(conn: sqlite3.Connection | None = None) -> None:
    username = (ADMIN_USERNAME or "").strip()
    password = (ADMIN_PASSWORD or "").strip()

    if not username or not password:
        print("❌ Admin credentials are missing in config/.env. Admin account NOT seeded.")
        return

    hashed_password = generate_password_hash(password)
    needs_close = conn is None
    if conn is None:
        conn = get_connection()

    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )
            """
        )

        existing = conn.execute(
            "SELECT id, password FROM admin WHERE username = ?",
            (username,),
        ).fetchone()

        if existing is None:
            conn.execute(
                "INSERT INTO admin (username, password) VALUES (?, ?)",
                (username, hashed_password),
            )
            print(f"✅ Seeded admin account: {username}")
        else:
            stored_password = (existing["password"] or "").strip()
            password_matches = False
            if stored_password:
                try:
                    password_matches = check_password_hash(stored_password, password)
                except Exception:
                    password_matches = stored_password == password

            if not password_matches:
                conn.execute(
                    "UPDATE admin SET password = ? WHERE username = ?",
                    (hashed_password, username),
                )
                print(f"🔄 Updated admin password hash for: {username}")
            else:
                print(f"✅ Admin account already up to date: {username}")

        conn.commit()
    finally:
        if needs_close:
            conn.close()


def run_all() -> None:
    apply_schema()
    seed_admin()
    seed_levels()
    seed_task_categories()
    seed_bonus_tasks()
    print("🎉 All schema + seed steps completed successfully.")


if __name__ == "__main__":
    run_all()