import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable

from config import DATABASE_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def fetch_one(
    conn: sqlite3.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any] | None:
    row = conn.execute(query, params).fetchone()
    return row_to_dict(row)


def fetch_all(
    conn: sqlite3.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> list[dict[str, Any]]:
    rows = conn.execute(query, params).fetchall()
    return rows_to_dicts(rows)


def has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)
