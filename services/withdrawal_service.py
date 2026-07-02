import json
import sqlite3
import uuid
from typing import Any

from werkzeug.security import generate_password_hash

from config import MIN_RETAINED_BALANCE, MIN_WITHDRAWAL_AMOUNT
from services.db_service import fetch_all, fetch_one, now_iso
from services.level_service import get_active_incomplete_level
from services.message_service import (
    build_withdrawal_pending_message,
    create_message,
)


ALLOWED_WITHDRAW_NETWORKS = {"MTN", "TELECEL", "TIGO", "AIRTELTIGO"}


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _valid_phone(number: str) -> bool:
    clean = (number or "").strip()
    return clean.isdigit() and len(clean) == 10 and clean.startswith("0")


def _clean_network(network: str) -> str:
    value = (network or "").strip().upper()
    if value == "AIRTELTIGO":
        return "AIRTELTIGO"
    return value


def get_user_balance(conn: sqlite3.Connection, user_id: str) -> float:
    row = fetch_one(
        conn,
        """
        SELECT balance
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    )
    if not row:
        raise ValueError("User not found.")
    return float(row["balance"] or 0.0)


def get_withdrawal_eligibility(
    conn: sqlite3.Connection,
    user_id: str,
) -> dict[str, Any]:
    user = fetch_one(
        conn,
        """
        SELECT user_id, balance
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    )
    if not user:
        raise ValueError("User not found.")

    active_level = get_active_incomplete_level(conn, user_id)
    balance = float(user["balance"] or 0.0)

    if active_level:
        return {
            "can_withdraw": False,
            "reason_code": "active_level_incomplete",
            "message": "Complete your active level before requesting a withdrawal.",
            "current_active_level_id": int(active_level["level_id"]),
            "current_active_level_number": int(active_level["level_number"]),
            "balance": balance,
            "minimum_withdrawal": float(MIN_WITHDRAWAL_AMOUNT),
            "minimum_retained_balance": float(MIN_RETAINED_BALANCE),
        }

    if balance < MIN_WITHDRAWAL_AMOUNT:
        return {
            "can_withdraw": False,
            "reason_code": "balance_below_minimum_withdrawal",
            "message": f"You need at least {int(MIN_WITHDRAWAL_AMOUNT)} GHS before you can request a withdrawal.",
            "current_active_level_id": None,
            "current_active_level_number": None,
            "balance": balance,
            "minimum_withdrawal": float(MIN_WITHDRAWAL_AMOUNT),
            "minimum_retained_balance": float(MIN_RETAINED_BALANCE),
        }

    return {
        "can_withdraw": True,
        "reason_code": None,
        "message": "Withdrawal is available.",
        "current_active_level_id": None,
        "current_active_level_number": None,
        "balance": balance,
        "minimum_withdrawal": float(MIN_WITHDRAWAL_AMOUNT),
        "minimum_retained_balance": float(MIN_RETAINED_BALANCE),
    }


def validate_withdrawal_request(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    amount: Any,
    network: str,
    number: str,
    name: str,
) -> dict[str, Any]:
    eligibility = get_withdrawal_eligibility(conn, user_id)
    if not eligibility["can_withdraw"]:
        raise ValueError(eligibility["message"])

    parsed_amount = _to_float(amount)
    if parsed_amount is None:
        raise ValueError("Invalid withdrawal amount.")

    if parsed_amount < MIN_WITHDRAWAL_AMOUNT:
        raise ValueError(
            f"Minimum withdrawal amount is {int(MIN_WITHDRAWAL_AMOUNT)} GHS."
        )

    balance = float(eligibility["balance"] or 0.0)
    if (balance - parsed_amount) < MIN_RETAINED_BALANCE:
        raise ValueError(
            f"You must keep at least {int(MIN_RETAINED_BALANCE)} GHS in your account."
        )

    clean_network = _clean_network(network)
    if clean_network not in ALLOWED_WITHDRAW_NETWORKS:
        raise ValueError("Invalid withdrawal network.")

    clean_number = (number or "").strip()
    if not _valid_phone(clean_number):
        raise ValueError("Withdrawal number must be 10 digits and start with 0.")

    clean_name = " ".join((name or "").strip().split())
    if not clean_name:
        raise ValueError("Withdrawal account name is required.")

    return {
        "amount": round(parsed_amount, 2),
        "network": clean_network,
        "number": clean_number,
        "name": clean_name,
        "balance_before": balance,
        "balance_after": round(balance - parsed_amount, 2),
    }



def create_withdrawal_request(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    amount: Any,
    network: str,
    number: str,
    name: str,
    method_id: str | None = None,
) -> dict[str, Any]:
    validated = validate_withdrawal_request(
        conn,
        user_id=user_id,
        amount=amount,
        network=network,
        number=number,
        name=name,
    )

    request_id = uuid.uuid4().hex[:12]
    payload = {
        "method_id": method_id,
        "network": validated["network"],
        "number": validated["number"],
        "accountName": validated["name"],
        "amount": validated["amount"],
        "balance_before": validated["balance_before"],
        "balance_after": validated["balance_after"],
        "reserve_applied": True,
    }

    try:
        conn.execute("BEGIN IMMEDIATE")
        updated = conn.execute(
            """
            UPDATE users
            SET balance = ROUND(balance - ?, 2)
            WHERE user_id = ?
              AND balance >= ?
              AND (balance - ?) >= ?
            """,
            (
                validated["amount"],
                user_id,
                validated["amount"],
                validated["amount"],
                MIN_RETAINED_BALANCE,
            ),
        )
        if updated.rowcount != 1:
            raise ValueError(f"You must keep at least {int(MIN_RETAINED_BALANCE)} GHS in your account.")

        conn.execute(
            """
            INSERT INTO requests (
                id,
                kind,
                user_id,
                payload,
                status,
                created_at,
                decided_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                "withdrawal",
                user_id,
                json.dumps(payload),
                "pending",
                now_iso(),
                None,
            ),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    title, body = build_withdrawal_pending_message(
        validated["amount"],
        validated["network"],
        validated["number"],
        request_id,
    )

    try:
        create_message(
            conn,
            user_id,
            title,
            body,
            "withdrawal_pending",
        )
    except Exception:
        pass

    return {
        "request_id": request_id,
        "status": "pending",
        "payload": payload,
        "balance_before": validated["balance_before"],
        "balance_after": validated["balance_after"],
    }


def get_withdrawal_history(

    conn: sqlite3.Connection,
    user_id: str,
) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        SELECT *
        FROM requests
        WHERE user_id = ?
          AND kind = 'withdrawal'
        ORDER BY created_at DESC
        """,
        (user_id,),
    )

    history: list[dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(row["payload"] or "{}")
        except Exception:
            payload = {}

        history.append(
            {
                "request_id": row["id"],
                "status": row["status"],
                "created_at": row["created_at"],
                "decided_at": row["decided_at"],
                "amount": float(payload.get("amount") or 0.0),
                "network": payload.get("network"),
                "number": payload.get("number"),
                "account_name": payload.get("accountName"),
                "method_id": payload.get("method_id"),
            }
        )

    return history

def ensure_withdrawal_methods_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawal_methods (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            network TEXT NOT NULL,
            number TEXT NOT NULL,
            name TEXT NOT NULL,
            pin TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_user_id ON withdrawal_methods(user_id)"
    )
    conn.commit()


def list_withdrawal_methods(
    conn: sqlite3.Connection,
    user_id: str,
) -> list[dict[str, Any]]:
    ensure_withdrawal_methods_table(conn)

    rows = fetch_all(
        conn,
        """
        SELECT id, network, number, name, created_at, updated_at
        FROM withdrawal_methods
        WHERE user_id = ?
          AND is_active = 1
        ORDER BY created_at DESC
        """,
        (user_id,),
    )

    return rows


def save_withdrawal_method(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    network: str,
    number: str,
    name: str,
    pin: str | None = None,
) -> list[dict[str, Any]]:
    ensure_withdrawal_methods_table(conn)

    clean_network = _clean_network(network)
    if clean_network not in ALLOWED_WITHDRAW_NETWORKS:
        raise ValueError("Invalid withdrawal network.")

    clean_number = (number or "").strip()
    if not _valid_phone(clean_number):
        raise ValueError("Account number must be 10 digits and start with 0.")

    clean_name = " ".join((name or "").strip().split())
    if not clean_name:
        raise ValueError("Withdrawal account name is required.")

    clean_pin = (pin or "").strip()
    if clean_pin and (len(clean_pin) != 6 or not clean_pin.isdigit()):
        raise ValueError("PIN must be 6 digits.")

    active_rows = fetch_all(
        conn,
        """
        SELECT id, network, number
        FROM withdrawal_methods
        WHERE user_id = ?
          AND is_active = 1
        ORDER BY created_at DESC
        """,
        (user_id,),
    )

    duplicate = next(
        (
            row for row in active_rows
            if row["network"] == clean_network and row["number"] == clean_number
        ),
        None,
    )

    timestamp = now_iso()

    if duplicate:
        conn.execute(
            """
            UPDATE withdrawal_methods
            SET name = ?, pin = ?, updated_at = ?
            WHERE id = ?
            """,
            (clean_name, generate_password_hash(clean_pin) if clean_pin else None, timestamp, duplicate["id"]),
        )
        conn.commit()
        return list_withdrawal_methods(conn, user_id)

    if len(active_rows) >= 2:
        raise ValueError("You can only save up to 2 withdrawal methods.")

    conn.execute(
        """
        INSERT INTO withdrawal_methods (
            id,
            user_id,
            network,
            number,
            name,
            pin,
            is_active,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (
            uuid.uuid4().hex[:12],
            user_id,
            clean_network,
            clean_number,
            clean_name,
            generate_password_hash(clean_pin) if clean_pin else None,
            timestamp,
            timestamp,
        ),
    )
    conn.commit()

    return list_withdrawal_methods(conn, user_id)

def delete_withdrawal_method(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    method_id: str,
) -> list[dict[str, Any]]:
    ensure_withdrawal_methods_table(conn)

    clean_method_id = (method_id or "").strip()
    if not clean_method_id:
        raise ValueError("Withdrawal method id is required.")

    row = fetch_one(
        conn,
        """
        SELECT id
        FROM withdrawal_methods
        WHERE id = ?
          AND user_id = ?
          AND is_active = 1
        """,
        (clean_method_id, user_id),
    )

    if not row:
        raise ValueError("Withdrawal method not found.")

    conn.execute(
        """
        UPDATE withdrawal_methods
        SET is_active = 0,
            updated_at = ?
        WHERE id = ?
          AND user_id = ?
        """,
        (now_iso(), clean_method_id, user_id),
    )
    conn.commit()

    return list_withdrawal_methods(conn, user_id)