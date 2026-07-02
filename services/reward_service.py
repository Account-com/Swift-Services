import sqlite3
from typing import Any

from services.db_service import fetch_one, now_iso


def credit_level_completion_reward(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
) -> dict[str, Any]:
    user_level = fetch_one(
        conn,
        """
        SELECT *
        FROM user_levels
        WHERE user_id = ? AND level_id = ?
        """,
        (user_id, level_id),
    )
    if not user_level:
        raise ValueError("User level record not found.")

    if int(user_level["reward_credited"]) == 1:
        user_row = fetch_one(
            conn,
            "SELECT balance FROM users WHERE user_id = ?",
            (user_id,),
        )
        return {
            "status": "already_credited",
            "amount": 0.0,
            "new_balance": float(user_row["balance"] or 0),
        }

    level = fetch_one(
        conn,
        "SELECT completion_reward FROM level_catalog WHERE id = ?",
        (level_id,),
    )
    if not level:
        raise ValueError("Level catalog record not found.")

    reward_amount = float(level["completion_reward"] or 0)
    timestamp = now_iso()

    conn.execute(
        """
        UPDATE users
        SET balance = COALESCE(balance, 0) + ?
        WHERE user_id = ?
        """,
        (reward_amount, user_id),
    )

    conn.execute(
        """
        UPDATE user_levels
        SET reward_credited = 1,
            updated_at = ?
        WHERE user_id = ? AND level_id = ?
        """,
        (timestamp, user_id, level_id),
    )

    conn.commit()

    user_row = fetch_one(
        conn,
        "SELECT balance FROM users WHERE user_id = ?",
        (user_id,),
    )

    return {
        "status": "credited",
        "amount": reward_amount,
        "new_balance": float(user_row["balance"] or 0),
    }