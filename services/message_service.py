from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.db_service import fetch_all, fetch_one

MESSAGE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user_id_created_at ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id_is_read ON messages(user_id, is_read);
"""


def ensure_messages_table(conn) -> None:
    conn.executescript(MESSAGE_SCHEMA_SQL)
    conn.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def format_currency(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"GHS {amount:,.2f}"


def _digits_only(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def describe_withdrawal_method(network: Any, number: Any) -> str:
    network_text = str(network or "").strip().upper() or "UNKNOWN"
    digits = _digits_only(number)
    ending = digits[-4:] if len(digits) >= 4 else digits[-2:] if len(digits) >= 2 else ""
    if ending:
        return f"{network_text} ending in {ending}"
    return network_text


def build_withdrawal_pending_message(
    amount: Any,
    network: Any,
    number: Any,
    request_id: str,
    eta_text: str = "1 to 30 minutes",
) -> tuple[str, str]:
    method = describe_withdrawal_method(network, number)
    title = "Withdrawal Pending"
    body = (
        f"Your withdrawal request of {format_currency(amount)} to {method} is pending review. "
        f"Reference ID: {request_id}. Estimated processing time: {eta_text}."
    )
    return title, body


def build_withdrawal_approved_message(
    amount: Any,
    network: Any,
    number: Any,
    request_id: str,
) -> tuple[str, str]:
    method = describe_withdrawal_method(network, number)
    title = "Withdrawal Approved"
    body = (
        f"Your withdrawal request of {format_currency(amount)} to {method} has been approved and processed successfully. "
        f"Reference ID: {request_id}."
    )
    return title, body


def build_withdrawal_rejected_message(
    amount: Any,
    network: Any,
    number: Any,
    request_id: str,
    reason: str | None = None,
) -> tuple[str, str]:
    method = describe_withdrawal_method(network, number)
    amount_text = f" of {format_currency(amount)}" if amount not in (None, "", 0) else ""
    title = "Withdrawal Rejected"
    body = f"Your withdrawal request{amount_text} to {method} was not approved. Reference ID: {request_id}."
    clean_reason = (reason or "").strip().rstrip(".")
    if clean_reason:
        body += f" Reason: {clean_reason}."
    return title, body


def build_level_unlocked_message(
    level_number: Any,
    unlock_fee: Any,
    reward: Any,
) -> tuple[str, str]:
    title = "Level Unlocked"
    body = (
        f"Level {level_number} has been unlocked successfully. "
        f"Unlock fee: {format_currency(unlock_fee)}. Reward: {format_currency(reward)}. "
        f"You may now start the level."
    )
    return title, body


def build_final_stage_unlocked_message(level_number: Any) -> tuple[str, str]:
    title = "Final Stage Unlocked"
    body = (
        f"The final stage for Level {level_number} is now available. "
        f"You may continue and complete the remaining tasks."
    )
    return title, body


def build_level_completed_message(level_number: Any, reward_amount: Any) -> tuple[str, str]:
    title = "Level Completed"
    body = (
        f"Level {level_number} has been completed successfully. "
        f"Reward credited: {format_currency(reward_amount)}."
    )
    return title, body


def _normalize_message_row(row: Any) -> dict[str, Any]:
    data = dict(row)
    data["is_read"] = bool(data.get("is_read", 0))
    data["category"] = data.get("category") or "system"
    data["body"] = data.get("body") or ""
    data["title"] = data.get("title") or "Message"
    return data


def create_message(
    conn,
    user_id: str,
    title: str,
    body: str,
    category: str = "system",
) -> dict[str, Any]:
    ensure_messages_table(conn)
    timestamp = now_iso()
    conn.execute(
        """
        INSERT INTO messages (
            user_id,
            title,
            body,
            category,
            is_read,
            created_at
        )
        VALUES (?, ?, ?, ?, 0, ?)
        """,
        (user_id, title, body, category, timestamp),
    )
    conn.commit()

    row = fetch_one(
        conn,
        """
        SELECT *
        FROM messages
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (user_id,),
    )
    return _normalize_message_row(row) if row else {}


def get_user_messages(conn, user_id: str) -> list[dict[str, Any]]:
    ensure_messages_table(conn)
    rows = fetch_all(
        conn,
        """
        SELECT *
        FROM messages
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        """,
        (user_id,),
    )
    return [_normalize_message_row(row) for row in rows]


def get_unread_count(conn, user_id: str) -> int:
    ensure_messages_table(conn)
    row = fetch_one(
        conn,
        """
        SELECT COUNT(*) AS unread_count
        FROM messages
        WHERE user_id = ? AND COALESCE(is_read, 0) = 0
        """,
        (user_id,),
    )
    return int(row["unread_count"] if row else 0)


def mark_message_as_read(conn, user_id: str, message_id: int) -> bool:
    ensure_messages_table(conn)
    cursor = conn.execute(
        """
        UPDATE messages
        SET is_read = 1
        WHERE id = ? AND user_id = ?
        """,
        (message_id, user_id),
    )
    conn.commit()
    return cursor.rowcount > 0


def mark_all_as_read(conn, user_id: str) -> int:
    ensure_messages_table(conn)
    cursor = conn.execute(
        """
        UPDATE messages
        SET is_read = 1
        WHERE user_id = ? AND COALESCE(is_read, 0) = 0
        """,
        (user_id,),
    )
    conn.commit()
    return cursor.rowcount


def delete_message(conn, user_id: str, message_id: int) -> bool:
    ensure_messages_table(conn)
    cursor = conn.execute(
        """
        DELETE FROM messages
        WHERE id = ? AND user_id = ?
        """,
        (message_id, user_id),
    )
    conn.commit()
    return cursor.rowcount > 0


def delete_all_messages(conn, user_id: str) -> int:
    ensure_messages_table(conn)
    cursor = conn.execute(
        """
        DELETE FROM messages
        WHERE user_id = ?
        """,
        (user_id,),
    )
    conn.commit()
    return cursor.rowcount
